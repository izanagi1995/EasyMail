// customMailQueue

var MailParser = require("mailparser").MailParser;
var mongoose = require('mongoose');
var async = require('async');
var DSN = require('./dsn');
var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;
var uuid = require('uuid');
var fs = require('fs');
var path = require('path');


var opt = {
               user: process.env.mongoUser,
               pass: process.env.mongoPass,
               auth: {
                    authdb: 'admin'
               }
          };
var mongoConn = mongoose.createConnection('localhost', 'easymail', 27017, opt);
var userSchema = new mongoose.Schema({
    _id      : ObjectId,
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
var mailModel = mongoConn.model('mails', mailSchema);
var userModel = mongoConn.model('users', userSchema);

exports.parseMail = function(transaction, callback) {
    var pl = this;
    var mailparser = new MailParser({
        defaultCharset: 'UTF-8',
        streamAttachments: true,
        forceEmbeddedImages: true
    });
    transaction.pipe(mailparser);
    mailparser.attached_files = [];
    mailparser.on('attachment', (function(attachment) {
        attachment.filePath = uuid.v4();
        pl.loginfo(path.resolve(path.join('attachments', attachment.filePath)));
        attachment.stream.pipe(fs.createWriteStream(path.join('attachments', attachment.filePath)));
        mailparser.attached_files.push(attachment);
    }.bind(this)));
    mailparser.on('end', function(mail) {
        async.map(mailparser.attached_files, function(attachment, next) {
            next(null, {
                path: attachment.filePath,
                name: attachment.generatedFileName,
                ext: attachment.generatedFileName.split(".").pop().toLowerCase(),
                cid: attachment.contentId,
                length: attachment.length,
                contentType: attachment.contentType
            })
        }.bind(this), function(err, attached_files) {
            mail.attached_files = attached_files;

            async.applyEach([], mail, function() {
                callback(mail);
            }.bind(this));
        }.bind(this));
    }.bind(this));
    return mailparser;
}

exports.queryUser = function(mail, callback){
    var query = userModel.find({email : mail});
    query.exec(function (err, res){
        if (err) {throw err;}
        if(res.length == 0){return callback(null);}
        return callback(res[0]);
    });
};

exports.getNextUID = function(callback){
    var pl = this;
    var q = mailModel.find().sort({uid:-1}).limit(1);
    q.exec(function(err, res){
        if(res.length == 0){
            pl.loginfo("No results found... Go to 0");
            return callback(0);  
        }
        pl.loginfo("Got a result = "+(res[0].uid + 1)); 
        return callback(res[0].uid + 1);
    });
}

exports.hook_queue = function(next, connection) {
    var pl = this;
    var user;
    this.loginfo('This mail is for '+connection.transaction.rcpt_to[0].address());
    this.queryUser(connection.transaction.rcpt_to[0].address(), function(dbUser){
        if(dbUser == null){
            next(DENY, DSN.no_such_user());
        }else{
            user = dbUser;
        }
        pl.parseMail(connection.transaction.message_stream, function(mail){
            if(!mail.date && mail.headers.date){
                mail.date = new Date(Date.parse(mails.headers.date));
            }else{
                //If no date is specified : Setting server date as mail date
                mail.date = new Date();
            }
            mail.internaldate = mail.date;
            mail.folder = "\\Inbox";
            mail.flags = [];
            pl.loginfo(JSON.stringify(mail, null, 4));
            var insertMail = new mailModel();
            for(var k in mail){
                if(k==="headers"){
                    insertMail[k] = JSON.stringify(mail[k]);
                }else{
                    insertMail[k] = mail[k];
                }
            }
            insertMail.user = user._id;
            pl.getNextUID(function(res){
                insertMail.uid = res;
                pl.loginfo(JSON.stringify(insertMail, null, 4));
                insertMail.save(function(err, data){
                    if(err) pl.loginfo(err);
                    else pl.loginfo("Saved "+data);
                });
                next(OK);
            });
            
        });
    });
    

};

