// Current directory
var rDir = __dirname;

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
    username : String,
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
allUsersQuery.exec(function(err, res){
    if (err) {throw err;}
    console.log('Registered users :');
    for(var i in res){
	   console.log(res[i].username);
    }
});
var envir = [];
envir['mongoUser'] = config.user;
envir['mongoPass'] = config.pass;


var haraka = cp.spawn('./node_modules/Haraka/bin/haraka', ['-c', 'haraka_run'], {env:envir});


haraka.stdout.on('data', function (data) {
    console.log('stdout: ' + data);
});

haraka.stderr.on('data', function (data) {
    console.log('ERROR (Haraka) : ' + data);
});

exports.getPassword = function(user, callback) {
    var query = userModel.find({username : user});
    query.exec(function (err, res){
        if (err) {throw err;}
        if(res.length == 0){return callback(null);}
        callback(res[0].password);
    });
}

exports.checkPassword = function(user, inputPW, callback){
    EasyMail.getPassword(user, function(pwd){
        if(null===pwd){return callback(false);}
        if(pwd===inputPW){
            return callback(true);
        }
        return callback(false);
    });
}

exports.queryUser = function(email, callback){
    var query = userModel.find({username : email});
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
            if(res.length == 0){return callback(null, null);}
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
