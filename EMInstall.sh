#!/bin/bash
REAL_USER=`who am i | awk '{print $1}'`
REAL_USER_ID="$(id -u "$REAL_USER")"

SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE" # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"

echo "========================"
echo "   EasyMail Installer   "
echo "========================"
echo
echo "This software will download and install EasyMail and all required dependencies. WARNING : Do not cancel installation during the process!"
echo "EasyMail will be installed in the current directory which is $DIR"
read -p "Continue? (Y/N)"
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]
then
  
    if ! foobar_loc="$(type -p "mongo")" || [ -z "$foobar_loc" ]; then
      echo "MongoDB not found : Installing..."
      apt-get update
      apt-get --yes --force-yes install mongodb-org
      if [[ $? > 0 ]]
      then
        echo "MongoDB installation failed... Aborting!"
        exit
      fi
    fi
    echo "Stopping existing MongoDB process"
    killall mongod
    echo "Starting MongoDB without authentification"
    mkdir /data/
    mkdir /data/db
    chown -R $REAL_USER_ID /data/db
    sudo -u $REAL_USER mongod --fork --logpath /var/log/mongodb.log --port 27017 --dbpath /data/db
    read -p 'Username for the MongoDB admin: ' mUser
    echo ""
    read -sp 'Password: ' mPass
    echo ""
    sudo -u $REAL_USER mongo --eval "db.getSiblingDB('admin').createUser({user:\"$mUser\",pwd:\"$mPass\",roles:[{role:\"userAdminAnyDatabase\",db:\"admin\"}]})"
    echo "User created! Restarting MongoDB with authentification"
    killall mongod
    echo "auth=true" >> /etc/mongod.conf
    service mongod start
    echo "MongoDB setup : OK!"

    echo "Downloading Haraka... Please wait..."
    #DO THE DOWNLOAD FROM THE MAIN GITHUB REPO
    sudo -u $REAL_USER npm install https://github.com/izanagi1995/EasyMail.git
    #Installing haraka
    sudo -u $REAL_USER ./node_modules/Haraka/bin/haraka -i haraka_run
    echo "Haraka setup : OK"

    echo "Writing config for MongoDB"
    sudo -u $REAL_USER config
    sudo -u $REAL_USER echo "user=$mUser" >> config/mongodb
    sudo -u $REAL_USER echo "pass=$mPass" >> config/mongodb
    echo "Config writed"

    echo "Downloading plugins..."
    cd haraka_run/plugins/auth
    sudo -u $REAL_USER wget https://raw.githubusercontent.com/izanagi1995/EasyMail/master/plugins/mongoAuth.js
    cd ..
    sudo -u $REAL_USER wget https://raw.githubusercontent.com/izanagi1995/EasyMail/master/plugins/customMailQueue.js
    echo "Done!"

    echo "Configuring Haraka"
    sudo -u $REAL_USER echo "auth/mongoAuth" >> haraka_run/config/plugins
    sudo -u $REAL_USER sed -i 's/;listen=\[::0\]:25/listen=\[::0\]:25,\[::0\]:587/g' haraka_run/config/smtp.ini
    echo "Done"
    echo "Downloading webInterface"
    cd "$DIR"
    mkdir webServer
    cd webServer && wget https://raw.githubusercontent.com/izanagi1995/EasyMail/master/webServer.zip
    unzip webInterface.zip
    echo "webInterface OK"
    echo "============================="
    echo "All things should be ready..."
    echo "============================="

    echo "First user configuration : "
    read -p 'Domain to configure (ex : izanagi1995.info) : ' domain
    read -p 'User to configure (ex : test) : ' user
    read -sp 'Password : ' pass
    sudo -u $REAL_USER mkdir -p "$DIR/haraka_run/mails/$domain/$user/{INBOX,SENT,SPAM,TRASH}"
    sudo -u $REAL_USER mongo -u $mUser -p $mPass --authenticationDatabase admin --eval "db.getSiblingDB('easymail').createCollection('users',{autoIndexID:true}"
    sudo -u $REAL_USER mongo -u $mUser -p $mPass --authenticationDatabase admin --eval "db.getSiblingDB('easymail').insert({username:\"$user@$domain\",password:\"$pass\"})"
    sudo -u $REAL_USER echo $domain >> haraka_run/config/host_list

fi
