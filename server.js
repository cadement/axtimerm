
var pjson = require('./package.json');
var version = pjson.version;
var dbVersion = pjson.dbVersion;
var timer = null;
var settings = require('./settings');
var utils = require('./utils');

var serialPort, sp = null;


settings.rmLiveUrl = 'http://live.axti.me';
if (process.env.NODE_ENV == 'dev')
    settings.rmLiveUrl = 'http://localhost:3000';


settings.dbVersion = '';
settings.dbUpgradeRequired = false;


var path = require('path');
global.appRoot = path.resolve(__dirname).toString();

var express = require('express')
var http = require('http')

var favicon = require('serve-favicon');
var logger = require('morgan');
var methodOverride = require('method-override');
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var bodyParser = require('body-parser');
var multer = require('multer');
var errorHandler = require('errorhandler');
var path = require('path');
var compression = require('compression');
var everyauth = require('everyauth');


var app = express();
var fs = require('fs');
var server = http.createServer(app);
var port = process.env.PORT || settings.port;
var env = process.env.NODE_ENV
    //, dburl = 'mongodb://localhost/LPR_AXtime_RM';
    , dburl = 'mongodb://localhost/' + settings.database;
var leaderboard = require('./lib/leaderboard.js');

// log file for express request logging
var logFile = fs.createWriteStream('./myLogFile.log', { flags: 'a' }); //use {flags: 'w'} to open in write mode

// for demo site
if (env == 'production'){
    settings.isDemo = true;
    dburl = 'mongodb://axtimedb:passAT123@ds035747.mongolab.com:35747/axtimerm_proto';
	//dburl = 'mongodb://nodejitsu:3e2ff8f557e7f5cc8abd97a798b2fdb9@alex.mongohq.com:10065/nodejitsudb696062380348';
}



everyauth.everymodule.findUserById( function (userId, callback) {
    //console.log('users.find')
    models.users.findById(userId, function(er, user){
        if (user){
            user.role = user.role || 'Club Admin';
        }
        callback(er, user);
    });
});

everyauth.password.getLoginPath('/login')
    .postLoginPath('/login')
    .loginView('login.jade')
    .authenticate(function (login, password) {
        var epw = utils.encrypt(password);
        var errors = [];
        if (!login) errors.push('Email is missing. ');
        if (!password) errors.push('Password is missing. ');
        if (errors.length) return errors;
        
        var promise = this.Promise();

        models.users.findOne({ username: login, epassword: epw }, function (er, u) {
            
            if (er) {
                return promise.fulfill(['Error, ' + er])
            } else if (!u) {
                return promise.fulfill(['Login information is not valid.'])
            }
            else {
                if (u.eventId){

                }
                return promise.fulfill(u);
            }
        });
        return promise;
    })
    //.loginSuccessRedirect('/')
    .respondToLoginSucceed(function (res, user, data) {
        if (user && user.eventId){
            this.redirect(res, '/event/' + user.eventId);
        } else if (user) {
            this.redirect(res,'/');
        }
    })
    .getRegisterPath('/register') // Uri path to the registration page 
    .postRegisterPath('/register')
    .registerUser( function (newUserAttributes) {return ['Not implemented.']});


app.mongoose = require('mongoose');

//database stuff

app.mongoose.connection.on('error', function(er){
    console.log('******** ********* ******** ******** ******* *******')
    console.log('DB ERROR: ' + er);
    console.log('******** ********* ******** ******** ******* *******')
});

app.mongoose.connection.on('connected', function(er){
    console.log('Database connected');
    console.log('Starting web server...');    
    server.listen(port, function() {
        console.log('Web server started and listening on port ' + port);
    });
});

app.mongoose.connection.on('disconnected', function(er){
    console.log('Database disconnected');
});

app.mongoose.connection.on('close', function(er){
    console.log('******** ********* ******** ******** ******* *******')
    console.log('DB closed');
    console.log('******** ********* ******** ******** ******* *******')
});

app.mongoose.connect(dburl);

function dbconnect(){
    app.mongoose.connect(dburl);
}

var sessionStore = new MongoStore({ url: dburl }); // remove for upgrades


app.set('port', port);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('combined', {stream: logFile}));
app.use(methodOverride());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ resave: true,
    saveUninitialized: true,
    store: sessionStore, secret: 'ijwoihnc0i239ronaefiuowihrjf0werhgjopaf' }));

app.use(everyauth.middleware(app));

app.use(compression());
app.use(multer({ dest: './public/uploads/'}));
app.use(express.static(path.join(__dirname, 'public')));


app.locals.site = {version:version};
app.locals.settings = settings;



var io = require('socket.io').listen(server); 



var models = {};
require('./models/config')(models, app.mongoose);


function getUserFromSession(sid, callback){
    
    sessionStore.get(sid, function (er, ses) {
        if (!er && ses){
            //console.log(ses);
            models.users.findById(ses.auth.userId, function(er,user){
                callback(er,user);
            });
        } else {
            callback(er || 'Session not found');
        }
    });    
}

io.use(function(socket, next){
    console.log('authorize socket')
    var hs = socket.request;
    var cookieRaw = hs.headers.cookie;
    if (cookieRaw){
        var cookie = utils.parseCookie(cookieRaw);
        var sid = cookie['connect.sid'];
        if (!sid){
            next();
        } else {
            socket.sessionId = sid.slice(2, sid.lastIndexOf('.'));
            getUserFromSession(socket.sessionId, function(er, user){
                //console.log('getUserFromSession: ' + er);
                //console.log(user)
                if (!er && user)
                    socket.user = user;
                
                next();
            });
        }
    } else {
        next();
    }
})

var hw = null;


//if (settings.hardware.enabled){
    
    var Hardware = require('./lib/hardwareEvents');
    hw = new Hardware({settings:settings});

    hw.on('started', function(){
        io.in('admin').emit('hardware', 'Timing hardware has started');
    });
    hw.on('closed', function(){
        io.in('admin').emit('hardware', 'Timing hardware has stopped');
    });
    
    hw.on('newtime', function(data){
        console.log('new time recevied: ' + JSON.stringify(data));
        if (data.time == 0)
            console.log('resetfinish');
        else {
            engine.timerFinish(data.time, data.timestamp, function(er, timeRecord){
                if (er) console.log(er);
                //TODO if there is an error, send back to time keeper and allow TK, CQ to easily choose a participant to assign.  
                // in case the CQ was asleep and missed a car going all the way through
            })
        }

    });


    hw.on('resetfinish', function(data){
        console.log('reset finish');
        engine.timerResetFinish(function(er){
            if (er) console.log(er);
        });

    });
    hw.on('resetstart', function(data){
        console.log('reset start');
        engine.timerResetStart(function(er){
            if (er) console.log(er);
        });
    });

    hw.on('error', function(er){
        console.log('\n\n\n\n\n* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * ')
        console.log('* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * ')
        console.log('ERROR received from timing hardware');
        console.log(er);
        console.log('* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * ')
        console.log('* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * \n\n\n\n\n')

        io.in('admin').emit('adminmsg', 'Timing hardware error: ' + er);

    });

    hw.on('start', function(data){
        console.log('start: ' + JSON.stringify(data));
        engine.timerStart(data.timestamp);
        //TODO not complete, just tracking on course now
    })

    hw.on('finish', function(data){
        console.log('finish: '  + JSON.stringify(data));
        engine.timerStop(data.time, data.timestamp, data.splits, function(er, timeRecord){
            //TODO handle no car in queue and let tk, cq easily assign part

            if (er) console.log(er);
        })
    })

    hw.on('split0', function(data){
        //console.log('split0: ' + JSON.stringify(data));
        engine.timerSplit(0, data.time, data.timestamp);
    })

    hw.on('split1', function(data){
        engine.timerSplit(1, data.time, data.timestamp);
    });

    hw.on('batterylevels', function(data){
        //console.log('hw.on batterylevels')
        io.to('admin').emit('battery', data);
    });


    try
    {
        hw.start();
        // setInterval(function(){
        //     console.log('server comport: ' + settings.hardware.comPort);
        //     hw.testprint();
        // }, 3000);
    }
    catch(ex){
        console.log('HARDWARE ERROR'.red);
        console.log(ex.toString().red);
    }

    //dev 
    //setTimeout(function(){hw.emit('resetstart')}, 2000);

//}

//TODO centralize settings and pass in
require('./routes/routes.js')(app, models, io, settings);
require('./routes/api.js')(app, models, io, settings, hw);
require('./routes/test.js')(app, models, io);


//setup processing engine
var engine = require('./lib/engine.js')({io:io, models:models, hardware:hw});

require('./lib/sockets.js')({io:io, models:models, engine:engine, sessionStore:sessionStore});


if (process.argv.length > 2){
    for (var i = 0; i < process.argv.length; i++) {
        if (process.argv[i] == 'auto-queue'){
            console.log('Start auto-queue testing.');
            var aq = require('./test/auto-queue')(models, io, 4);
        }
    };
}
    



// // check for live event and sync with online
// var today = new Date();
// var todayInt = today.getFullYear() * 10000 + ((today.getMonth()+1 ) * 100) + today.getDate();
// models.events.findOne({dateInt: todayInt, uploadResults:true}, function(er, data){
//     if (data){
//         console.log('found live event to upload to live results');
        
//     }
// })




