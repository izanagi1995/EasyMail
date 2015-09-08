// Current directory
var rDir = __dirname;

var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var app = express();
var ini = require('ini');
var fs = require('fs');
var cp = require('child_process');
var MailParser = require("mailparser").MailParser;

var config = ini.parse(fs.readFileSync('config/mongodb', 'utf-8'));

var EasyMail = this;

var mongoConn = mongoose.createConnection('mongodb://'+config.user+':'+config.pass+'@localhost:27017/easymail');
var userSchema = new mongoose.Schema({
    username : String,
    password : String
});
var userModel = mongoConn.model('users', userSchema);
var allUsersQuery = userModel.find();
allUsersQuery.exec(function(err, res){
    if (err) {throw err;}
    console.log('Registered users :');
    for(var i in res){
	console.log(res[i].username);
    }
});
var envir = [];
envir['mongo'] = mongoConn;
envir['userModel'] = userModel;


var haraka = cp.spawn('./node_modules/Haraka/bin/haraka', ['-c', 'haraka_run'], {env:envir});


haraka.stdout.on('data', function (data) {
    console.log('stdout: ' + data);
});

haraka.stderr.on('data', function (data) {
    console.log('ERROR (Haraka) : ' + data);
});


exports.startWServer = function(){

}

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

exports.getMails = function(user, domain, folder, limit, callback){
    var DOMAIN = __dirname + "/haraka_run/mails/" + domain;
    var USER = DOMAIN + "/" + user;
    var INBOX = USER + "/" + folder + "/";
    var res = [];
    fs.readdir(INBOX, function(err, files){
        if(files.length==0){
            return callback(null, []);
        }
        if(err){ return callback(err, res); }
        files.forEach(function(file){
            var mailparser = new MailParser();
            mailparser.on("end", function(mObject){
                mObject.file = file;
                res.push(mObject);
                if(res.length == files.length || res.length == limit){
                    return callback(null, res);
                }
            });
            fs.createReadStream(INBOX+file).pipe(mailparser);
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
            res.render('mails.html', {mails : mObjects, box: folder});
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

var server = app.listen(3000, function(){
    var host = server.address().address;
    var port = server.address().port;
    console.log('Example app listening at http://'+host+':'+port);

});
