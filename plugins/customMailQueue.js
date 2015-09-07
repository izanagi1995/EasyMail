// customMailQueue

// documentation via: haraka -c /home/dev/hakara_run -h plugins/customMailQueue

// Put your plugin code here
// type: `haraka -h Plugins` for documentation on how to create a plugin

var fs = require('fs'),
  path = require('path');

exports.hook_queue = function(next, connection) {
	var pl = this;
    var date = new Date().getTime();
    var to = connection.transaction.rcpt_to[0].address().split('@');
    var DOMAIN = __dirname + "/../mails/"+to[1];
    var USER = DOMAIN + "/"+to[0];
    var INBOX = USER + "/INBOX/";
    var rand = Math.floor(Math.random() * (1024 - 0) + 0);
    var mailFile = INBOX + date + "--" +rand + ".eml"
    this.loginfo("Path of mail "+path.resolve(mailFile));
    var ws = fs.createWriteStream(mailFile);
    ws.once('close', function () {
        return next(OK);
    });
    connection.transaction.message_stream.pipe(ws);
};

