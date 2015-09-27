// Current directory
var rDir = __dirname;

var firstRun = require('first-run');
var bcrypt = require('bcrypt-nodejs');

var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');

var mongoose = require('mongoose');

var ini = require('ini');
var fs = require('fs');
var cp = require('child_process');

var MailParser = require('mailparser').MailParser;
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');

var IMAPServer = require('imapseagull'),
    AppStorage = require('imapseagull-storage-mongo'),
    fs = require('fs'),
    path = require('path');

var app = express();

var config = ini.parse(fs.readFileSync('config/mongodb', 'utf-8'));

var EasyMail = this;


var opt = {
    user: config.user,
    pass: config.pass,
    auth: {
        authdb: 'admin'
    }
};
var mongoConn = mongoose.createConnection('localhost', 'easymail', 27017, opt);

var userSchema = new mongoose.Schema({
    email : String,
    password : String
});
var mailSchema = new mongoose.Schema({
    html: String,
    text: String,
    headers: String,
    subject : String,
    messageId : String,
    priority : String,
    from : [{address: String, name: String}],
    to : [{address: String, name: String}],
    date : Date,
    attached_files : [{
        path: String,
        name: String,
        ext: String,
        cid: String,
        length: Number,
        contentType: String
    }],
    internaldate : Date,
    folder : String,
    flags : [{type: String}],
    user : [{type: mongoose.Schema.Types.ObjectId, ref: 'users'}],
    uid: Number,
});
var userModel = mongoConn.model('users', userSchema);
var mailModel = mongoConn.model('mails', mailSchema);
var allUsersQuery = userModel.find();

var envir = [];
envir['mongoUser'] = config.user;
envir['mongoPass'] = config.pass;

var users;

allUsersQuery.exec(function(err, res){
    if (err) {throw err;}
    console.log('Registered users :');
    users = res;
    for(var i in res){
       console.log(res[i].email);
    }
});

if(firstRun()){
    console.log('=========================================');
    console.log('=======HEY! THIS IS THE FIRST RUN========');
    console.log('=Welcome! We need to do some small steps=');
    console.log('Then, the server will start automatically');
    console.log(' ');
    console.log('Encrypting your password...');
    userModel.find().exec(function(err, res){
        for(var i in res){
            EasyMail.encryptPassword(res[i].email, function(err, n){
            	if(err) throw err;
            	console.log('Successfully encrypted user '+res[i].email);
            });
        }
    });
    

}


var haraka = cp.spawn('./node_modules/Haraka/bin/haraka', ['-c', 'haraka_run'], {env:envir});


haraka.stdout.on('data', function (data) {
    console.log('stdout: ' + data);
});

haraka.stderr.on('data', function (data) {
    console.log('ERROR (Haraka) : ' + data);
});

exports.encryptPassword = function(user, callback){
    EasyMail.getPassword(user, function(pass){
        console.log('Encrypting '+pass);	
        var encr = bcrypt.hashSync(pass);
	console.log('result is '+encr);
        userModel.update({email : user}, {password : encr}, null, function(err, num){
	    console.log('Hurra!');
            callback(err, num);
        });
    });
}

exports.getPassword = function(user, callback) {
    var query = userModel.find({email : user});
    query.exec(function (err, res){
        if (err) {throw err;}
        if(res.length == 0){return callback(null);}
        callback(res[0].password);
    });
}

exports.checkPassword = function(user, inputPW, callback){
    EasyMail.getPassword(user, function(pwd){
        if(null===pwd){return callback(false);}
        if(bcrypt.compareSync(inputPW, pwd)){
            return callback(true);
        }
        return callback(false);
    });
}

exports.getAttachment = function(mail, attUID, callback){
    var query = mailModel.findOne({uid: mail, 'attached_files.path': attUID});
    query.exec(function (err, res){
        if (err) {return callback(err, null);}
        if(!res) return callback("Not Found", null);
        for(var i=0; i < res.attached_files.length; i++){
            if(res.attached_files[i].path === attUID){
                return callback(null, res.attached_files[i]);
            }
        }
    });
}

exports.queryUser = function(mail, callback){
    var query = userModel.find({email : mail});
    query.exec(function (err, res){
        if (err) {throw err;}
        if(res.length == 0){return callback(null);}
        return callback(res[0]);
    });
}

exports.getMails = function(user, domain, folder, limit, callback){
    this.queryUser(user+"@"+domain, function(res){
        var userID = res._id;
        var query = mailModel.find({user : userID, folder: "\\"+folder}).limit(limit);
        query.exec(function (err, res){
            if (err) {return callback(err, null);}
            return callback(null, res);
        });
    });
}
exports.getMail = function(user, domain, folder, mail, callback){
    this.queryUser(user+"@"+domain, function(res){
        var userID = res._id;
        var query = mailModel.findOne({user : userID, folder: "\\"+folder, uid: mail});
        query.exec(function (err, res){
            if (err) {return callback(err, null);}
            if(!res) return callback("Not Found", null);
            return callback(null, res);
        });
    });
}

var RES_FOLDER = __dirname + "/webServer/public";
app.set('views', RES_FOLDER);
app.engine('html', require('ejs').renderFile);
app.use(session({secret: 's2a9xU23GiPSn4E1',resave: true, saveUninitialized: true}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true})); 
app.disable('etag');

var sess;


app.use('/static', express.static(RES_FOLDER + '/static'));


app.get('/',function(req,res){
    sess=req.session;
    //Session set when user Request our app via URL
    if(sess.email){
        res.redirect('/mails/INBOX');
    }else{
        res.render('index.html');
    }
});





app.post('/login',function(req,res){
    sess=req.session;
    EasyMail.checkPassword(req.body.email, req.body.pass, function(success){
        if(!success){
            res.end('bad');
            return;
        }
        res.end('done');
    });
    sess.email=req.body.email;
    
});

app.get('/mails/:folder', function(req, res){
    var folder = req.params.folder;
    sess=req.session;
    if(sess.email)
    {
        //res.render('loading.html', {user : sess.email});
        var split = sess.email.split('@');
        EasyMail.getMails(split[0], split[1], folder, 50, function(err, mObjects){
            if(err){
                res.render('wrong.html', {error : err});
                return;
            }
            mObjects.sort(function(a,b){
                // Turn your strings into dates, and then subtract them
                // to get a value that is either negative, positive, or zero.
                return new Date(b.date) - new Date(a.date);
            });
            console.log(JSON.stringify(mObjects, null, 4));
            res.render('mails.html', {mails : mObjects, box: folder});
        });
    }
    else
    {
        res.redirect('/');
    }
});

app.get('/mails/:folder/view/:mail', function(req, res){
    var folder = req.params.folder;
    var mail = req.params.mail;
    sess=req.session;
    if(sess.email)
    {
        //res.render('loading.html', {user : sess.email});
        var split = sess.email.split('@');
        EasyMail.getMail(split[0], split[1], folder, mail, function(err, mObject){
            if(err){
                res.render('wrong.html', {error : err});
                return;
            }
            
            res.render('view.html', {mail : mObject});
        });
    }
    else
    {
        res.redirect('/');
    }
});

app.get('/download/:mUID/:aUID', function(req, res){
    var mail = req.params.mUID;
    var attUID = req.params.aUID;
    var file = path.join(rDir, 'attachments', attUID);
    EasyMail.getAttachment(mail, attUID, function(err, att){
        if(err){
            res.render('wrong.html', {error : err});
            return;
        }
        res.setHeader('Content-disposition', 'attachment; filename=' + att.name);
        res.setHeader('Content-type', att.contentType);
        var fstream = fs.createReadStream(file);
        fstream.pipe(res);
    });
});

app.get('/logout',function(req,res){
    req.session.destroy(function(err){
        if(err){
            console.log(err);
        }
        else
        {
            res.redirect('/');
        }
    });
});
app.post('/send',function(req, res){
    sess=req.session;
    if(sess.email)
    {
        EasyMail.getPassword(sess.email, function(pwd){
            var options =   {
                            host: 'localhost',
                            port: 587,
                            auth: {
                                user: sess.email,
                                pass: pwd
                            }
                        };
            console.log("pwd is "+pwd);
            var transporter = nodemailer.createTransport(options);
            console.log("Transporter created");
            transporter.sendMail({
                from: sess.email,
                to: req.body.to,
                subject: req.body.subject,
                text: req.body.body
            });
            console.log("Go!");
        });
        res.end('done');
        
    }
    else
    {
        res.redirect('/');
    }
});

var server = app.listen(3000, function(){
    var host = server.address().address;
    var port = server.address().port;
    console.log('Example app listening at http://'+host+':'+port);

});



var NAME = 'izanagi1995.info';

var storage = new AppStorage({
    name: NAME,
    debug: true,

    // directory to keep attachments from emails
    attachments_path: path.join(__dirname, './attachments/'),

    // connection string for mongo
    connection: 'mongodb://'+config.user+':'+config.pass+'@localhost:27017/easymail?auto_reconnect&authSource=admin',

    // collections names
    messages: 'mails',
    users: 'users'
});

// function 'init' specified into AppStorage to provide availability to redefine it
storage.init(function(err) {
    if (err) throw new Error(err);

    var imapServer = IMAPServer({

        // Instead of imap-handler (https://github.com/andris9/imap-handler) you can choose
        // wo-imap-handler (https://github.com/whiteout-io/imap-handler) or anything you want with same API
        imapHandler: require('imap-handler'),

        debug: true,
        plugins: [
            // List of plugins. It can be string for modules from lib//plugins/*.js or functions, that will be
            // initialized as plugin_fn(<IMAPServer object>)
            'ID', 'STARTTLS', 'AUTH-PLAIN', 'SPECIAL-USE', 'NAMESPACE', 'IDLE', /*'LOGINDISABLED',*/
            'SASL-IR', 'ENABLE', 'LITERALPLUS', 'UNSELECT', 'CONDSTORE'
        ],
        id: {
            name: NAME,
            version: '1'
        },
        credentials: {
            // just for example
            key: fs.readFileSync(path.join(__dirname, './node_modules/imapseagull/tests/server.crt')),
            cert: fs.readFileSync(path.join(__dirname, './node_modules/imapseagull/tests/server.key'))
        },
        secureConnection: false,
        storage: storage,
        folders: {
            'INBOX': { // Inbox folder may be only here
                'special-use': '\\Inbox',
                type: 'personal'
            },
            '': {
                folders: {
                    'Drafts': {
                        'special-use': '\\Drafts', // 'special-use' feature is in core of our IMAP implementation
                        type: 'personal'
                    },
                    'Sent': {
                        'special-use': '\\Sent',
                        type: 'personal'
                    },
                    'Junk': {
                        'special-use': '\\Junk',
                        type: 'personal'
                    },
                    'Trash': {
                        'special-use': '\\Trash',
                        type: 'personal'
                    }
                }
            }
        }
    });

    imapServer.on('close', function() {
        console.log('IMAP server %s closed', NAME);
    });

    imapServer.listen(143, function() {
        console.log('IMAP server %s started', NAME);
    });

});
