require('../color');
var fs = require('fs')
    , msr = require('../lib/msr.js')
    , engine = null
    , leaderboard = {}
    , importer = null
    , request = require('request')
    , utils = require('../utils')
    , exporter = require('../lib/data-export')
    , path = require('path')
    ;

const UNIVERSAL_NEWLINE = /\r\n|\r|\n/g;


var pjson = require('../package.json')
    , version = pjson.version
    , dbVersion = pjson.dbVersion
    , settings//settings = require('../settings')
    , axtime = require('../utils.js')
    , backupDirectory = '../_backups';

function setGuestSession(req, eid) {
    //req.session.auth = {role:'',clubname:'',eventId:eid}
}


function authorize(allowed){
    //allowed = array of roles allowed
    
    return function(req,res,next){
    
        if (!allowed){
            return next();
        }
        else if (!req.user || allowed.indexOf(req.user.role) == -1){
            res.status(401).send('Not authorized.');
        }
        else {
            return next();
        }
    }
}

// function ensureAdmin(req,res,next){
//     if (req.session.auth && req.session.auth.role == 'Club Admin'){
//         return next();
//     }
//     else {
//         res.status(401).send('Not authorized.')
//     }
// }


module.exports = function (app, models, io, _settings) {
    leaderboard = require('../lib/leaderboard2.js')({models:models});
    engine = require('../lib/engine.js')({models:models, io:io})
    importer = require('../lib/importer.js')({models:models});
    settings = _settings;

    var hardwareButtonsEnabled = settings.hardware.enabled  && settings.hardware.interfaceType.toLowerCase() == 'tlinkdirect';

    app.get('/resetit', function (req, res) {
        req.logout();
        res.send('reset session.auth = null');
    });

    app.get('/newgrid', function (req,res){
        res.render('timekeeper-grid.jade', {title:'new grid'})
    })

    app.get('/admin/:clubname/settings', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname, allow = false, message=null;
        console.log('settings');
        
        res.render('admin_systemsettings', {title:'System Settings', clubname:clubname})
            
    })


    app.get('/admin/hardware', authorize(['Club Admin','Event Admin', 'Time Keeper']), function(req,res){
        res.render('system/hardware', {title:'Timing Hardware'})
    })

    app.get('/admin/:clubname/dbupgrade', authorize(['Club Admin']), function(req,res){

        var clubname = req.params.clubname, allow = false, message=null;

        models.clubs.findOne({name:clubname}, function(er, club){
            if (club){
                var message = '';
                if (club.dbVersion == null){
                    message = 'You need to upgrade your database from 1.0.0 to ' + dbVersion;
                }
                else if (club.dbVersion !== dbVersion) {
                    message = 'You need to upgrade your database from ' + club.dbVersion + ' to ' + dbVersion;
                }
                res.render('admin_dbupgrade', {title:'Database upgrade', club:club, message:message, session:req.session})
            }
            else res.send('Invalid club')
        });
        
    })

    app.post('/admin/:clubname/dbupgrade', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname, allow = false, message=null;
        var start = new Date().getTime();

            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    var message = '';

                    function finish(){
                        club.dbVersion = dbVersion;
                        club.save(function(er){
                            console.log('all done with upgrade');
                            res.render('admin_dbupgrade', {title:'Database upgrade', club:club, message:message, done:true, session:req.session})    
                        })
                        
                    }


                    console.log('current dbVersion ' + club.dbVersion);
                    console.log('upgrading to ' + dbVersion);
                    var upgrades = require('../lib/dbupgrade')(models);
                    var v = [0,0,0];
                    if (club.dbVersion !== null)
                        v = club.dbVersion.split('.');
                    
                    var build = parseInt(v[2]);
                    if (build == 2){
                        message = 'Already upgraded';
                        finish();
                    }
                    else if (build == 1){
                        upgrades.upgrade2(function(er){
                            message = 'Your db was upgraded. ' + (er || '');
                            finish();
                        })
                    }
                    else if (build == 0){
                        upgrades.upgrade1(club, function(er){
                            upgrades.upgrade2(function(er){
                                message = 'Your db was upgraded. ' + (er || '');
                                finish();
                            })
                        })
                    } 
                    else {
                        message = 'Unknown build version.  Contact clubsupport@axti.me';
                        finish();
                    }

                }
                else {
                    res.send('Invalid club.');
                }
            });
        
    })


    app.get('/admin/:clubname/upgrade', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname;
        res.render('admin/upgrade', {title:'System Upgrade', session:req.session, clubname:clubname})
    })



    app.get('/', function (req, res) {
        

        //req.session.auth = { role: "", clubname: "", eventId: null };
      
        //if (settings.isLocal) {
            // local install, find club entry
            
            models.clubs.findOne({}, function (err, d) {
                
                if (d) {
                    var clubname = d.name;
                    //club found, send club home
                    models.events.find({ "club.name": clubname }).select('_id date season name location participantCount totalRuns').sort({ 'date': -1 }).exec(function (err, evs) {

                        //req.session.auth = { role: 'Club Admin', clubname: clubname, eventid: null };
                            //res.render('clubchooser.jade', {
                            //    title: 'AXti.me Home',
                            //    clubs: [d]
                            //    , session: req.session
                            //    , version: pjson.version
                        //});
                        evs.sort(function (a, b) {
                            return new Date(a.date) > new Date(b.date) ? -1 : 1;
                        });
                        res.render('club_home.jade', {
                            title: clubname
                            , session: req.session
                            , events: evs
                            , club: d
                            , settings:settings
                        });
                    });
                } else {
                    // do club setup
                  
                    //req.session.auth = { role: 'Club Admin', clubname: '', eventid: null };
                    res.render('clubsetup.jade', {
                        title: 'Setup your new system'
                            , session: req.session
                            , data:{}

                    });
                }
            });

        // }
        // else {
        //     console.log('web edition');
        // }


        //////get all the clubs
        //models.clubs.find({}, function (err, clubs) {

        //    //render the index page
        //    res.render('clubchooser.jade', {
        //        title: 'AXti.me Home',
        //        clubs: clubs
        //        , session: req.session
        //        , version: version
        //    });
        //});
    });

    app.get('/club/:clubname/admin/changepassword', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname;
        
            res.render('admin_changepassword', {title:'Change Admin Password', clubname:clubname})
        
        
    })
    app.post('/club/:clubname/admin/changepassword', authorize(['Club Admin']), function(req,res){
        
        res.render('admin_changepassword', {title:'Change Admin Password'})
        
    })

    app.get('/club/:clubname/datawipe', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname, allow = false, pw = req.query['pw'];
        //TODO backup first
        console.log('pw=' + pw);
        if (pw == 'doit'){
            models.events.remove({}).exec();
            models.participants.remove({}).exec();
            models.runs.remove({}).exec();
            models.members.remove({}).exec();
            models.seasons.remove({}).exec();
            models.times.remove({}).exec();
            models.audit.remove({}).exec();
            res.send('ok... done.')
        }
        else {res.send('Invalid request');}
    });

    // app.get('/demo/:clubname/dataload', function(req,res){
    //     if (req.session.auth.role == 'Club Admin'){
            
    //         res.send('not implemented.');


            
    //     } else {
    //         res.send('Not authorized.');
    //     }


    // })

    app.get('/audit', function (req, res) {
        models.audit.find().sort({ 'date': -1 }).exec(function (er, data) {
            res.render('audit.jade', {
                title: 'Audit Log'
                , audits:data
            });
        });
    });

    app.get('/help/:clubname/faqs', function(req,res){
        var clubname = req.params.clubname;
        models.clubs.findOne({ "name": clubname }, function (err, d) {
            if (d) {
                res.render('getting_started.jade', {title:'FAQs', session:req.session, club:d})
            } else {
                res.send('Invalid request.');
            }
        });
        
    })

    app.get('/help/:clubname/roles', function(req,res){
        var clubname = req.params.clubname;
        models.clubs.findOne({ "name": clubname }, function (err, d) {
            if (d) {
                res.render('help-roles.jade', {title:'Roles', session:req.session, club:d})
            } else {
                res.send('Invalid request.');
            }
        });
        
    })



    app.post('/initialsetup', function (req, res) {
        var name = req.body.name
            , abbr = req.body.abbr
            , gpw = req.body.pw
            , key = req.body.key
            , msg = 'invalid request.'
            , unique = req.body.uniqueNumberPerClass == 'yes'
            , url = '/';

        
        function finish() {
            res.render('clubsetup_results.jade', {
                title: 'Setup your new system'
                , session: req.session
                , message: msg
                , url:url
            });
        }
        key = key ? key.replace(/ /g,'') : null;
        var errors = [];
        if (!key || key.length != 32){
            errors.push('Cloud Key should be 32 characters. Try copy and paste.');
        }
        if (!gpw || gpw.length < 8){
            errors.push('Admin Password must be at least 8 characters.')
        }
        if (!name || name.length < 8){
            errors.push('Club name must be at least 8 characters');
        }
        if (!abbr || abbr.length < 2){
            errors.push('Abbreviation must be at least 2 characters');
        }

        if (errors.length > 0){
            console.log(errors)
            res.render('clubsetup', {title: 'Setup your system', session:req.session, errorMessages:errors, data:{name:name, abbr:abbr,gpw:gpw, key:key, unique:unique}})
        }
        else if (settings.isLocal) {
            models.clubs.findOne({}, function (err, d) {
                if (d) {
                    // do not allow setup
                    msg = 'System was already setup.  Please use the Admin page.';
                    url = '/';
                    finish();
                } else {
                    var club = new models.clubs();
                    club.name = name;
                    club.shortName = abbr;
                    club.guestPassword = gpw;
                    club.AXRId = '';
                    club.AXRPassword = '';
                    club.uniqueNumberPerClass = unique;
                    club.dbVersion = dbVersion;
                    club.save(function (er) {
                        var busr = new models.users();
                        busr.firstName = 'AXti.me';
                        busr.lastName = 'Admin';
                        busr.email = 'backdoor@axti.me';
                        busr.username = 'adonus';
                        busr.epassword = axtime.encrypt('6pebr=teF$dr&C27');
                        busr.save();
                        var admuser = new models.users();
                        admuser.firstName = 'Club';
                        admuser.lastName = 'Admin';
                        admuser.email = 'clubadmin@axti.me';
                        admuser.username = 'admin';
                        admuser.epassword = axtime.encrypt(gpw);
                        admuser.save(function (era) {
                            //TODO error handle
                            //req.session.auth = { role: 'Club Admin', clubname: name, eventid: null };
                            msg = 'Awesome!  You are now ready to use your system.';
                            url = '/';
                            var season = new models.seasons();
                            season.clubId = club._id;
                            season.seasonYear = new Date().getFullYear();
                            
                            season.classPoints = [
                                {position:1, points:10}
                                , {position:2, points:9}
                                , {position:3, points:8}
                                , {position:4, points:7}
                                , {position:5, points:6}
                                , {position:6, points:5}
                                , {position:7, points:4}
                                , {position:8, points:3}
                                , {position:9, points:2}
                                , {position:10, points:1}
                                ];
                            var pp = [];
                            pp.push(100);
                            pp.push(94);
                            pp.push(88);
                            pp.push(82);
                            pp.push(77);
                            pp.push(72);
                            pp.push(68);
                            pp.push(64);
                            pp.push(60);
                            pp.push(56);
                            pp.push(52);
                            pp.push(48);
                            pp.push(44);
                            pp.push(40);
                            pp.push(36);
                            pp.push(32);
                            pp.push(29);
                            pp.push(26);
                            pp.push(23);
                            pp.push(20);
                            pp.push(18);
                            pp.push(16);
                            pp.push(14);
                            pp.push(12);
                            pp.push(10);
                            pp.push(8);
                            pp.push(6);
                            pp.push(4);
                            pp.push(2);
                            pp.push(1);
                            var ppt = [];
                            for (var i=1;i<31;i++){
                                ppt.push({position:i, points:pp[i-1]});
                            }
                            season.paxPoints = ppt;

                            season.classes = [{name:'FUN',category:'FUN',index:1, description:'FUN Class', isLadies:false, isStock:false,include:false, paxClass:''}];
                            season.paxClasses = [];
                            season.totalEvents = 0;
                            season.paxMaxEvents = 6;
                            season.classMaxEvents = 6;
                            season.conePenalty = 2;
                            season.save();

                            settings.cloudKey = key;
                            fs.writeFileSync('./settings.js', 'module.exports = ' + JSON.stringify(settings,null, 4));
                            
                            finish();
                        });
                    });
                }
            });
        } else {
            msg = 'Invalid public request.';
            finish();
        }
    });

    // LIST backups from computer
    app.get('/club/:clubname/restore/local', authorize(['Club Admin']), function(req,res){
        
        var clubname = req.params.clubname, allow = false, message=null;

            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    var br = require('../lib/backupRestore')({models:models, version:version, localBackupDirectory:backupDirectory});

                    br.backup.getLocalBackups(backupDirectory, function(er, files){
                        if (er) {message = 'ERROR: ' + er;files=[]}
                        else {
                            files.sort(function(a,b){
                                if (a.backupDate < b.backupDate) return 1;
                                return -1;
                            })
                        }
                        res.render('restore.jade', {title:'Restore From Your Computer', source:'local', files:files,club:club, session:req.session, message:message})
                    })
                } else {
                    res.send('Invalid club.')
                }
                
            });
        
            
    })


    // do restore local
    app.get('/club/:clubname/restore/local/:filename', authorize(['Club Admin']), function(req,res){

        var clubname = req.params.clubname
            , filename = req.params.filename
            , allow = false;

            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    var br = require('../lib/backupRestore')({models:models, version:version, localBackupDirectory:backupDirectory});

                    br.restore.doLocal(filename, function(er, results){

                        var msg = null;
                        if (er)msg = er;

                        console.log(results);
                        //res.send(results);
                        res.render('restoreComplete.jade', {title:'Restore Complete', session:req.session, message:msg, results:results})
                    })
                    //res.send('ok');

                } else {
                    res.send('Invalid club.')
                }
                
            });
       

    })
    app.post('/club/:clubname/restore/local', authorize(['Club Admin']), function(req,res){

        var clubname = req.params.clubname
            , filename = req.body.filename, allow = false;

            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    var br = require('../lib/backupRestore')({models:models, version:version, localBackupDirectory:backupDirectory});

                    br.restore.doLocal(filename, function(er, results){

                        console.log(results);
                        res.send(results);
                    })
                    //res.send('ok');

                } else {
                    res.send('Invalid club.')
                }
                
            });
       

    })

    // restore home
    app.get('/club/:clubname/restore', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname, allow = false, message=null;

            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    var br = require('../lib/backupRestore')({models:models, version:''});
                    br.backup.getLocalBackups(function(er, files){
                        if (er) {message = 'ERROR: ' + er;files=[]}
                        else {
                            files.sort(function(a,b){
                                if (a.backupDate < b.backupDate) return 1;
                                return -1;
                            })
                        }
                        res.render('restores.jade', {title:'Restore Data', files:files,club:club, cloudKey:settings.cloudKey, session:req.session, message:message})
                        //res.render('restores.jade', {title:'Restore Data', message:null, session:req.session, club:club})
                    })
                    
                }
            });
        
    });

    // // list backups from cloud
    // app.get('/club/:clubname/restore/cloud', function(req,res){
    //     var clubKey = req.query.clubKey;
    //     var clubname = req.params.clubname, allow = false, message=null;

    //     if (req.session.auth) {
    //         if (req.session.auth.role == 'Club Admin') {
    //             allow = true;
    //         }
    //     }

    //     if (allow){
    //         models.clubs.findOne({name:clubname}, function(er, club){
    //             if (club){
                    
    //                 var br = require('../lib/backupRestore')({models:models, version:version, localBackupDirectory:backupDirectory});

    //                 br.backup.getCloudBackups(clubKey, function(er, files){
    //                     if (er) {message = 'ERROR: ' + er;files = []}
    //                     else 
    //                         files.sort(function(a,b){
    //                             if (a.backupDate < b.backupDate) return 1;
    //                             return -1;
    //                         })
    //                     res.render('restore.jade', {title:'Restore From AXti.me Cloud', source:'cloud', clubKey:clubKey, files:files,club:club, session:req.session, message:message})
    //                 })
    //             } else {
    //                 res.send('Invalid club.')
    //             }
                
    //         });
    //     } else {
    //         res.send('You must be logged in as a Club Admin');
    //     }
            
    // })

    // restore from cloud
    app.get('/club/:clubname/restore/cloud/:clubkey/:filename', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname
            , filename = req.params.filename
            , clubKey = req.params.clubkey
            , allow = false
            , message = null;

            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    var br = require('../lib/backupRestore')({models:models, version:version, localBackupDirectory:backupDirectory});
                    console.log('attempting restore from cloud')
                    console.log(clubKey + ', ' + filename);
                    br.restore.doCloud(clubKey, filename, function(er, results){

                        var msg = null;
                        if (er)msg = er;
                        console.log(er);
                        console.log(results);
                        //res.send(results);
                        res.render('restoreComplete.jade', {title:'Restore Complete', session:req.session, message:msg, results:results})
                    })
                    //res.send('ok');

                } else {
                    res.send('Invalid club.')
                }
                
            });
        
    })

    // data backup
    app.get('/club/:clubname/backup', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname, allow = false;

            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    res.render('backup.jade', {title:'Data Backup to the Cloud.', club:club, cloudKey:settings.cloudKey, session:req.session, message:null})
                } else {
                    res.send('Invalid club.')
                }
                
            });
        
    });

    app.post('/club/:clubname/backup', authorize(['Club Admin']), function(req,res){

        var clubname = req.params.clubname
            , allow = false
            , cloudKey = req.body.clubKey;

            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    var doCloud = req.body.type == 'Do Local and Cloud Backup';
                    var label = req.body.label;
                    label = label.replace(/[^a-zA-Z0-9 ]/g,'');
                    var br = require('../lib/backupRestore')({models:models, version:version, localBackupDirectory:backupDirectory});
                    
                    if (doCloud){
                        
                        br.backup.cloud(label, cloudKey, function(er, path){
                            if (er) {res.send('error: ' + er)}
                            else {
                                res.render('backup.jade', {title:'Backup your Data', club:club, cloudKey:settings.cloudKey, session:req.session, message:'Nice work. Your backup has been completed successfully! Remember to backup often.'})
                                
                            }
                        })
                    }
                    else {
                        
                        br.backup.local(label, function(er){
                            if (er) {res.send('error: ' + er)}
                            else {
                                res.render('backup.jade', {title:'Backup your Data', club:club, cloudKey:settings.cloudKey, session:req.session, message:'Nice work. Your backup has been completed successfully! Remember to backup often.'})
                                
                            }
                        })
                        // br.backup.doLocal(backupDirectory + '/', function(er, path){
                        //     if (er) {res.send('error: ' + er)}
                        //     else {
                        //         res.render('backup.jade', {title:'Backup your Data', club:club, session:req.session, message:'Nice work. Your backup has been completed successfully! Remember to backup often.'})
                                
                        //     }
                        // })
                    }
                    
                } else {
                    res.send('Invalid club.')
                }
                
            });
        
    });
    



    //system users
    app.get('/club/:clubname/users', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname, allow = false;
        
            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    models.users.find({eventId:null}).where('username').ne('adonus').exec(function(er,users){
                        if (users){
                            res.render('users.jade', {title:'System Admin Users', users:users, club:club, session:req.session})
                        }
                        else {
                            res.send('database error');
                        }
                    });
                } else {
                    res.send('Invalid club.')
                }
                
            });
        
    });

    //edit club admin
    app.get('/club/:clubname/user/:username', function (req, res) {
        var clubname = req.params.clubname
            , username = req.params.username, allow = false;
        
            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    models.users.findOne({username:username}).exec(function(er,user){
                        if (user){
                            var dpassword = axtime.decrypt(user.epassword);
                            user.dpassword = dpassword;
                            res.render('user.jade', {title:'User: ' + user.username, user:user, userId:user._id, club:club, session:req.session, message:null})
                        }
                        else {
                            res.send('database error');
                        }
                    });
                } else {
                    res.send('Invalid club.')
                }
                
            });
        
    });

    //new club admin
    app.get('/club/:clubname/user', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname
        , allow = false;
        
            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    var user = new models.users();
                    user.dpassword = '';
                    user.firstName = '';
                    user.lastName = '';
                    user.email = '';
                    user.username = '';
                    res.render('user.jade', {title:'New User', user:user, userId:'', club:club, session:req.session, message:null});
                } else {
                    res.send('Club does not exist.');
                }
            });
       
    });
    
    //save club admin
    app.post('/club/:clubname/user', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname
            , username = req.body.username
            , password = req.body.password 
            , fname = req.body.firstName
            , lname = req.body.lastName
            , email = req.body.email 
            , userId = req.body.userid
            , isEdit = userId != ''
            , isDelete = req.body.btnDelete == 'Delete User'
            , allow = false;
        
        

        //TODO CHECK FOR DUPLICATE USERNAME

        
            models.clubs.findOne({name:clubname}, function(er, club){
                if (club){
                    if (username.length == 0
                        || fname.length == 0
                        || lname.length == 0
                        || email.length < 7
                        || password.length == 0){
                        var user = new models.users();
                        user.firstName = fname;
                        user.lastName = lname;
                        user.email = email;
                        user.username = username;
                        user.dpassword = password;
                        res.render('user.jade', {title:'New User', user:user, userId:'', club:club, session:req.session, message:'You did not fill out all fields.'});
                    }
                    else if (isDelete){
                        var del = models.users.findById(userId);
                        del.remove(function(er){
                            //res.send('deleted ' + memberId);
                            res.redirect('/club/' + clubname + '/users');
                        })
                        
                    }
                    else if (isEdit){
                        models.users.findById(userId).exec(function(er,user){
                            if (user){
                                models.users.findOne({username:username}).where('_id').ne(userId).exec(function(er,dup){
                                    user.firstName = fname;
                                    user.lastName = lname;
                                    user.email = email;
                                    user.username = username;
                                    user.epassword = axtime.encrypt(password);
                                    user.role = 'Club Admin';
                                    if (dup == null){
                                        user.save(function(er){
                                            if (er) res.send('ERROR saving data: ' + er);
                                            else {
                                                user.dpassword = password;
                                                res.render('user.jade', {title:'User: ' + user.username, user:user, userId:userId, club:club, session:req.session, message:'Successfully saved user!'});
                                            }
                                        })
                                    } else {
                                        user.dpassword = password;
                                        res.render('user.jade', {title:'User: ' + user.username, user:user, userId:userId, club:club, session:req.session, message:'FAILED. There is already a user with the username (' + username + ').'});
                                    }
                                })
                                
                            }
                            else {
                                res.send('User not found');
                            }
                        });
                    } else {
                        console.log('create new admin user')
                        var user = new models.users();
                        user.firstName = fname;
                        user.lastName = lname;
                        user.email = email;
                        user.username = username;
                        user.epassword = axtime.encrypt(password);
                        user.role = 'Club Admin';
                        models.users.findOne({username:username}).exec(function(er,dup){
                            if (dup == null) {
                                user.save(function(er){
                                    if (er) res.send('ERROR saving data: ' + er);
                                    else {
                                        user.dpassword = password;
                                        res.render('user.jade', {title:'User: ' + user.username, user:user, userId:user._id, club:club, session:req.session, message:'Successfully Created New User!'})    
                                    }
                                    
                                })
                            } else {
                                user.dpassword = password;
                                res.render('user.jade', {title:'New User', user:user, userId:'', club:club, session:req.session, message:'FAILED. There is already a user with the username (' + username + ').'})    
                            }
                        })
                    }

                } else {
                    res.send('Invalid club.')
                }
                
            });
       
    });


    app.get('/club/:clubname/upload', function (req, res) {
        var clubname = req.params.clubname;
        models.clubs.findOne({ "name": clubname }, function (err, d) {
            if (d) {
                res.render('uploadtoaxr.jade', {title:'Upload to AutocrossResults.com', club:d});
            } else {
                res.send('Invalid request.');
            }
        });
    });

    app.get('/club/:clubname/settings', authorize(['Club Admin']), function (req,res){
        var clubname = req.params.clubname;
        //if (req.session.auth && req.session.auth.role == 'Club Admin'){
            models.clubs.findOne({ "name": clubname }, function (err, d) {
                if (!err && d) {
                    var sep = require('serialport');
                    sep.list(function (err, ports) {
                        res.render('settings.jade', {title:'Settings', club:d, settings:settings, session:req.session, message:null, ports:ports});
                      // ports.forEach(function(port) {
                      //   console.log(port.comName);
                      //   console.log(port.pnpId);
                      //   console.log(port.manufacturer);
                      // });
                    });

                    
                } else {
                    res.send('Invalid request.');
                }
            });
        // } else {
        //     res.send('Not authorized.');
        // }
    });

    app.post('/club/:clubname/settings', authorize(['Club Admin']), function (req,res){
        var clubname = req.params.clubname
            , isValid = true
            , message = ''
            , messages = [];

            var comport = req.body.comport.trim()
                , httpPort = parseInt(req.body.httpPort)
                , dbname = req.body.dbname.trim()
                , hardwareEnabled = req.body.hardwareEnabled == 'yes'
                , interfaceType = req.body.interfaceType
                , splits = parseInt(req.body.splits)
                , displayHardware = req.body.displayHardware
                , cloudKey = req.body.cloudKey || '';

            if (httpPort <80 || httpPort > 8080){
                isValid = false;
                messages.push("Invalid HTTP Port, consider using 80 or 3000");
            }
            if (['JaCircuitsChrono','JaCircuitsNormal','Debug','TlinkDirect'].indexOf(interfaceType) == -1){
                isValid = false;
                messages.push(interfaceType + ' is not a valid Hardware Interface.');
            }
            if (splits < 0 || splits > 2){
                isValid = false;
                messages.push('Invalid splits number, must be 0, 1 or 2.');
            }

            if (isValid){
                var ss = 'module.exports={\n'
                    + '\tisLocal: true\n'
                    + '\t, isDemo: false\n'
                    + '\t, database: "' + dbname + '" // AXtime_RM\n'
                    + '\t, port: ' + httpPort + '\n'
                    + '\t, hardware: {\n'
                    + '\t\t enabled: ' + hardwareEnabled + ' //true or false\n'
                    + '\t\t, interfaceType: "' + interfaceType + '"  // JaCircuitsNormal, JaCircuitsChrono,TlinkDirect,Debug\n'
                    + '\t\t, comPort: "' + comport + '" // COM1-7 for Windows , /dev/cu.usbserial for OSX\n'
                    + '\t\t, liveEventId: ""\n'
                    + '\t\t, splitCount: ' + splits + ' // change this value to the number of split eyes you have on course (we only handle 1 right now)\n'
                    + '\t\t, displayHardware: "' + displayHardware + '" //RA6X80\n'
                    + '\t\t}\n'
                    + '\t, liveEventId: ""\n'
                    + '\t, debug: false\n'
                    + '\t, cloudKey: "' + cloudKey + '"\n'
                    + '\t, rmLiveUrl: "http://live.axti.me"\n'
                    + '}';
                settings.hardware.comPort = comport;
		settings.hardware.interfaceType = interfaceType;
                fs.writeFile('./settings.js', ss, function (er){
                    console.log('SYSTEM SETTINGS HAVE BEEN CHANGED.  RESTART APPLICATION.');
                    res.send('Settings saved.  You must restart AXti.me RM for your changes to take affect.');
                })
            }
            else {
                var msg = messages.join(', ');
                res.send('Invalid settings. ' + msg);
            }
         
    })

    // app.get('/club/:clubname/login', function (req, res) {
    //     if (settings.isLocal) {
    //         res.render('login_admin.jade', {
    //             title: 'Login'
    //             , message:''
    //         });
    //     }
    //     else {
    //         res.sendfile('./public/Login.html');
    //     }
    // });

    app.get('/run/:id', authorize(['Club Admin','Event Admin','Time Keeper']), function(req,res){
        var id = req.params.id, allow = false;
        
            models.runs.findById(id, function(er, run){
                if (er || !run){
                    res.send('There is no run associated with the time.')
                } else {
                    models.events.findById(run.eventId, function(er, tevent){
                        models.participants.find({eventId:run.eventId}).sort({'driver.name':1}).exec(function(er, participants){
                            //TODO error handle
                            res.render('run.jade', {title:'Run Details', event:tevent, session:req.session, run:run, participants:participants});
                        })
                            
                    });
                }
                
            });
        
    });

    //import msr members
    app.get('/club/:clubname/importevent/csv', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname, allow = false;
        
            models.clubs.findOne({ "name": clubname}, function (err, d) {
                if (d) {
                    res.render('club_importeventcsv.jade', {title:'Import Event ', message:null, club:d});
                }
                else {
                    res.sendfile('./public/Login.html');
                }
            });
       

    });


    // import axware event from rgg
    app.post('/club/:clubname/importevent/csv', authorize(['Club Admin']), function (req, res) {
        //TODO redo for member and class
        var file = req.files.csvfile, clubname = req.params.clubname;
        var cols = [], parts = [], runNumber = 0, allow = false, start = new Date().getTime();


        function bad(msg) { res.send('Invalid request. ' + msg); }


            var date = req.body.date
                , eventNumber = req.body.num
                , location = req.body.location;
            var datetouse = date;
            var dateInt = 0;
            if (date.indexOf('-') > -1) {
                var dd = date.split('-');
                if (parseInt(dd[0]) > 1900) {
                    datetouse = dd[1] + '/' + dd[2] + '/' + dd[0];
                }
            }
            var dd = new Date(datetouse);
            var seasonYear = dd.getFullYear();

            dateInt = dd.getFullYear() * 10000 + (dd.getMonth() + 1) * 100 + dd.getDate();
            models.clubs.findOne({ name: clubname }, function (er1, club) {
                if (club) {
                    models.seasons.findOne({ clubId: club._id, seasonYear: seasonYear }, function (ers, clubseason) {
                        if (clubseason) {
                            models.members.find({'club.id':club._id}, function(er,members){
                                var participantCount = 0;

                                var classlist = clubseason.classes;
                                //console.log('classses: ' + classlist.length);
                                var ev = new models.events();
                                ev.name = seasonYear + ' ' + club.shortName + ' #' + (eventNumber < 10 ? '0' + eventNumber : eventNumber);
                                //ev.stations = ns;
                                ev.dateInt = dateInt;
                                ev.countForPoints = true;
                                ev.sessions = 0;
                                //ev.name = name;
                                ev.club = { name: clubname, id: club._id };

                                ev.date = datetouse;
                                ev.season = seasonYear;
                                ev.eventNumber = eventNumber;
                                ev.location = { name: location, coords: '' };
                                ev.workerRoles = [];
                                ev.runGroups = [{ name: 'Red', color: 'red' }];
                                ev.uploadResults = false;
                                ev.save(function(er){
                                    console.log('event saved: ' + er);
                                    // function driver() {
                                    //     return { axclass: '', carnumber: '', clubMemberId:'', paid: false
                                    //         , fname: '', lname: ''
                                    //         , car: { color: '', year: 0, description: '', make: '', model: '' }
                                    //         , runs: [] 
                                    //     };
                                    // }
                                    // function run() {
                                    //     return { rawTime: 0, cones: 0, isDnf: false, isOff: false, getsRerun: false }
                                    // }
                                    function lookupClass(cls) {
                                        var obj = null;
                                        
                                        for (var i = 0; i < classlist.length; i++) {
                                            if (cls == classlist[i].name) {
                                                obj = classlist[i];
                                                break;
                                            }
                                        }
                                        return obj;
                                    }
                                    function lookupMember(cmi, fname, lname, carnum){
                                        if (cmi.length == 0 && fname.length == 0 && lname.length == 0) return null;

                                        for (var mix in members){
                                            var mm = members[mix];
                                            if (mm.clubMemberId == cmi && cmi.length > 0){
                                                console.log('lookup good:' + cmi + ' - ' + mm.clubMemberId)
                                                return mm;
                                            } 
                                            //TODO more accurate way than first/last?
                                            else if (mm.firstName.toLowerCase() == fname.toLowerCase() && mm.lastName.toLowerCase() == lname.toLowerCase() && lname.length > 0 && fname.length > 0){
                                                return mm;
                                            }
                                        }
                                        return null;
                                    }

                                    var tmp_path = file.path;
                                    
                                    fs.readFile(tmp_path, 'utf8', function (er, data) {
                                        if (er) {bad('ERROR reading uploaded file. ' + er);}
                                        else {   
                                            importer.events.csvImport(data, function(er, drivers){
                                                //{ axclass: '', carnumber: '', first: '', last:''
                                                // , paid: false, car: {year:0, description:'',make:'',model:'', color:''}
                                                // , runs:[]// time, cones, penalty
                                                //var totalRuns = 0;
                                                var runNumber = 0;
                                                function addMember(driver, callback){
                                                    var member = new models.members();
                                                    member.club = {id:club._id, name:club.name}
                                                    member.clubMemberId = '';
                                                    member.firstName = driver.first;
                                                    member.lastName = driver.last;
                                                    member.lastAxClass = '';
                                                    member.msrId = '';
                                                    member.cars = [];
                                                    member.clubRegion = '';
                                                    member.dedicatedNumber = '';
                                                    member.dateCreated = new Date();
                                                    member.dateUpdated = new Date();
                                                    member.addresses = [];
                                                    member.emails = [];
                                                    member.phones = [];
                                                    member.sponsors = [];
                                                    member.save(function(er){
                                                        console.log('saved member')
                                                        //callback(er, member);
                                                        if (er) { doLine();}
                                                        else {
                                                            addParticipant(driver, member);
                                                        }
                                                    })
                                                }
                                                function addParticipant(driver, member, callback){
                                                    participantCount++;

                                                    var axclass = lookupClass(driver.axclass);
                                                    if (axclass == null){
                                                        axclass = {name:'FUN', isLadies:false, isStock:false, paxClass:'', index:1}
                                                    }
                                                    var runs = driver.runs;

                                                    var drivero = {
                                                        name: member.fullName
                                                        , car: driver.car
                                                        , carNumber:''
                                                    }
                                                    var part = new models.participants();
                                                    part.eventId = ev._id;
                                                    part.club = {id:club._id, name:club.name};
                                                    part.runGroup = {name:'Red', color:'red'}
                                                    part.memberId = member._id;
                                                    part.driver = drivero;
                                                    part.station = '';
                                                    part.workerRole = 'None';
                                                    part.axClass = axclass;
                                                    part.isImported = true;
                                                    part.save(function(er){
                                                        // add times
                                                        var driverRunNumber = 0;
                                                        function addRun(){
                                                            var run = runs.shift();
                                                            if (run !== undefined){
                                                                var nrun = new models.runs();
                                                                runNumber++;
                                                                //totalRuns++;
                                                                driverRunNumber++;
                                                                nrun.eventId = ev._id;
                                                                nrun.runNumber = runNumber;
                                                                nrun.participantId = part._id;
                                                                nrun.memberId = member._id;
                                                                nrun.driverRunNumber = driverRunNumber;
                                                                nrun.club = { name: club.name, id: club._id };
                                                                nrun.driver = drivero;
                                                                nrun.runGroup = { name: 'Red', color: 'red' }
                                                                nrun.session = 1;
                                                                
                                                                nrun.axClass = axclass;
                                                                nrun.status = 'F';
                                                                nrun.totalTime = run.time;
                                                                if (run.cones > 0)
                                                                    nrun.rawTime = run.time - run.cones;
                                                                else 
                                                                    nrun.rawTime = run.time;

                                                                if (nrun.rawTime > 0) {
                                                                    nrun.paxTime = Math.floor((nrun.totalTime) * axclass.index * 100000) / 100000 ;
                                                                } else {nrun.paxTime = 0;}
                                                                nrun.cones = run.cones;
                                                                nrun.isDnf = run.penalty == 'dnf';
                                                                nrun.isOff = run.penalty == 'off';
                                                                nrun.getsRerun = run.penalty == 'rerun';
                                                                nrun.save(function(er){
                                                                    //TODO error handle
                                                                    addRun();
                                                                })
                                                            } else {
                                                                doLine();
                                                            }
                                                        }

                                                        addRun();
                                                    })

                                                }

                                                function doLine(){
                                                    var driver = drivers.shift();
                                                    if (driver !== undefined){
                                                        var member = lookupMember('', driver.first, driver.last, '');
                                                        if (member == null) {
                                                            addMember(driver);
                                                        } else {
                                                            console.log('member exists');
                                                            addParticipant(driver, member);
                                                        }
                                                    }
                                                    else {
                                                        ev.participantCount = participantCount;
                                                        ev.totalRuns = runNumber;
                                                        ev.save(); //TODO wrap for error
                                                        engine.recalcEvent(ev._id, function(er){
                                                            //TODO error handle
                                                            res.render('club_importeventcsv.jade', {title:'Import Event ', message:'Done importing file', club:club});
                                                        })
                                                        
                                                    }
                                                }
                                                if (er){bad('ERROR parsing event file. ' + er);}
                                                else {
                                                    doLine();

                                                }

                                            });
                                        }
                                    });
                                  
                                });


                            }); // models.members
                        } else { bad('No season setup.'); }
                    }); //models.season
                } else { bad('No club found.'); }
            }); //club
            
    });

    
    //TODO update import to eventimport
    app.get('/club/:clubname/importhome', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname
            , allow = false;
        
        models.clubs.findOne({name:clubname}, function(er, club){

            if (club != null){

                res.render('club_importhome.jade', {title:'Import Data', message:null, club:club, session:req.session});

            } else {
                res.send('Not Authorized.  Please Sign In');
            }
        })
    });



    //TODO update import to eventimport
    app.get('/club/:clubname/import', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname
            , allow = false;
        
            res.render('club_importaxwareevent.jade', {title:'Import Events from AxWare', message:null, clubname:clubname});    
        
    });

    // import axware event from rgg
    app.post('/club/:clubname/import', authorize(['Club Admin']), function (req, res) {
        //TODO redo for member and class
        var file = req.files.rggfile, clubname = req.params.clubname;
        var cols = [], parts = [], runNumber = 0, allow = false, start = new Date().getTime();


        function bad(msg) { res.send('Invalid request. ' + msg); }

            var date = req.body.date
                , eventNumber = req.body.num
                , location = req.body.location;
            var datetouse = date;
            var dateInt = 0;
            if (date.indexOf('-') > -1) {
                var dd = date.split('-');
                if (parseInt(dd[0]) > 1900) {
                    datetouse = dd[1] + '/' + dd[2] + '/' + dd[0];
                }
            }
            var dd = new Date(datetouse);
            var seasonYear = dd.getFullYear();

            dateInt = dd.getFullYear() * 10000 + (dd.getMonth() + 1) * 100 + dd.getDate();
            models.clubs.findOne({ name: clubname }, function (er1, club) {
                if (club) {
                    models.seasons.findOne({ clubId: club._id, seasonYear: seasonYear }, function (ers, clubseason) {
                        if (clubseason) {
                            models.members.find({'club.id':club._id}, function(er,members){

                                var classlist = clubseason.classes;
                                //console.log('classses: ' + classlist.length);
                                var ev = new models.events();
                                ev.name = seasonYear + ' ' + club.shortName + ' #' + (eventNumber < 10 ? '0' + eventNumber : eventNumber);
                                //ev.stations = ns;
                                ev.dateInt = dateInt;
                                ev.countForPoints = true;
                                ev.sessions = 0;
                                //ev.name = name;
                                ev.club = { name: clubname, id: club._id };

                                ev.date = datetouse;
                                ev.season = seasonYear;
                                ev.eventNumber = eventNumber;
                                ev.location = { name: location, coords: '' };
                                ev.workerRoles = [];
                                ev.runGroups = [{ name: 'Red', color: 'red' }];
                                ev.uploadResults = false;
                                function driver() {
                                    return { axclass: '', paxclass:'', carnumber: '', clubMemberId:'', paid: false
                                        , fname: '', lname: ''
                                        , car: { color: '', year: 0, description: '', make: '', model: '' }
                                        , runs: [] 
                                    };
                                }
                                function run() {
                                    return { rawTime: 0, cones: 0, isDnf: false, isOff: false, getsRerun: false }
                                }
                                function lookupClass(cls) {
                                    var obj = null;
                                    
                                    for (var i = 0; i < classlist.length; i++) {
                                        if (cls == classlist[i].name) {
                                            obj = classlist[i];
                                            break;
                                        }
                                    }
                                    return obj;
                                }


                                function lookupMember(cmi, fname, lname, carnum){
                                    if (cmi.length == 0 && fname.length == 0 && lname.length == 0) return null;

                                    for (var mix in members){
                                        var mm = members[mix];
                                        if (mm.clubMemberId == cmi && cmi.length > 0){
                                            console.log('lookup good:' + cmi + ' - ' + mm.clubMemberId)
                                            return mm;
                                        } 
                                        //TODO more accurate way than first/last?
                                        else if (mm.firstName.toLowerCase() == fname.toLowerCase() && mm.lastName.toLowerCase() == lname.toLowerCase() && lname.length > 0 && fname.length > 0){
                                            return mm;
                                        }
                                    }
                                    return null;
                                }
                                ev.save(function (err) {
                                    if (err)
                                        console.log(err);

                                    function recalc() {
                                        console.log('done importing in ' + (new Date().getTime() - start) + 'ms');
                                        engine.recalcEvent(ev._id, function (er, p) { 
                                                //res.send(p);
                                                res.redirect('/event/' + ev._id.toString());
                                        });
                                    }
                                    var partcount = 0;

                                    var importedList = [];
                                    //var classes = clubseason.classes;

                                    function addParticipant(mem, driver){
                                        partcount++;

                                        var partstart = new Date().getTime();
                                        var part = new models.participants()
                                            ;
                                        var drivero = { name: driver.fname + ' ' + driver.lname
                                            , carNumber: driver.carnumber
                                            , car: { description: driver.car.description, year: driver.car.year, model: driver.car.model, make: driver.car.make, color: driver.car.color } };
                                        part.eventId = ev._id;
                                        part.memberId = mem._id;
                                        part.club = { name: club.name, id: club._id };
                                        part.driver = drivero;

                                        //extract class with pax supported
                                        var classes = clubseason.classes.slice(0)
                                            ;
                                        var ocls = driver.axclass
                                            , tpaxclass = ''
                                            , classFound = false
                                            , classObjToUse = {name:'NOTFOUND:' + driver.axclass, index:1,paxClass:'', isLadies:false, isStock:false, category:''};

                                        var tClassObj = utils.extractClass2(clubseason.paxClasses, classes, driver.axclass);

                                        classFound = tClassObj != null;

                                        // if (clubseason.paxClasses.length > 0){
                                        //     for (var px=0;px<clubseason.paxClasses.length;px++){
                                        //         if (ocls.toString().toLowerCase().lastIndexOf(clubseason.paxClasses[px].name.toString().toLowerCase(), 0) === 0){
                                        //             //pax class detected, trim 
                                        //             tpaxclass = clubseason.paxClasses[px].name;
                                        //             ocls = ocls.substring(tpaxclass.length);
                                        //         }
                                        //     }
                                        // }

                                        // var tClassObj = new axtime.classObj()
                                        //     , nclass = null;

                                        // for (var cc = 0;cc<classes.length;cc++){
                                        //     if (ocls.toLowerCase().trim() == classes[cc].name.toLowerCase().trim()) {
                                        //         nclass = classes[cc];
                                        //         nclass.paxClass = tpaxclass;
                                        //         classFound = true;
                                        //         break;
                                        //     }
                                        // }

                                        //console.log(eClass);
                                        if (!classFound){
                                            //part.axClass = {name:'NOTFOUND:' + driver.axclass, index:1,paxClass:'', isLadies:false, isStock:false, category:''};
                                            //tClassObj.name = 'NOTFOUND: ' + driver.axclass;
                                            tClassObj = classObjToUse;
                                        } else {
                                            // tClassObj.name = nclass.paxClass == '' ? nclass.name : (nclass.paxClass + '-' + nclass.name);
                                            // tClassObj.index = nclass.index;
                                            // tClassObj.category = nclass.category;
                                            // tClassObj.description = nclass.description;
                                            // tClassObj.isLadies = nclass.isLadies;
                                            // tClassObj.isStock = nclass.isStock;
                                            // tClassObj.paxClass = nclass.paxClass;
                                        }
                                        part.axClass = tClassObj;
                                        // var tClassObj = null;
                                        // for (var c = 0; c < classes.length; c++) {
                                            
                                        //     var co = classes[c]
                                        //         , ctc = co.name;
                                        //     if (ocls.trim().toLowerCase() == ctc.trim().toLowerCase()) {
                                        //         console.log('MATCHED');
                                              
                                        //         co.paxClass = tpaxclass;

                                        //         part.axClass = co;

                                        //         tClassObj = co;
                                        //         classFound = true;
                                        //         break;
                                        //     }
                                        // }
                                        // if (tpaxclass != ''){
                                        //     //classObjToUse.name = tpaxclass + '-' + classObjToUse.name;
                                        //     part.axClass.name = tpaxclass + '-' + part.axClass.name;
                                        //     tClassObj.name = tpaxclass + '-' + tClassObj.name;
                                        // }
                                        // console.log(part.axClass);
                                        // if (!classFound){
                                        //     // for (var c=0;c<clubseason.classes.length;c++){
                                        //     //     console.log(ocls + ', "' + clubseason.classes[c].name + '" "' + clubseason.classes[c].name.toLowerCase() + '"');
                                                
                                        //     // }
                                        //     part.axClass = {name:'NOTFOUND:' + driver.axclass, index:1,paxClass:'', isLadies:false, isStock:false, category:''}
                                        //     console.log('CLASS ' + driver.axclass + ' not found.');
                                        //     console.log('pax: "' + tpaxclass + '", cls: "' + ocls + '"');
                                        // }
                                        //part.axClass = classObjToUse;
                                        
                                        // var eClass = axtime.extractClass(driver.axclass, clubseason.classes, clubseason.paxClasses);
                                        // var tClassObj = new axtime.classObj();

                                        // //console.log(eClass);
                                        // if (eClass == null){
                                        //     //part.axClass = {name:'NOTFOUND:' + driver.axclass, index:1,paxClass:'', isLadies:false, isStock:false, category:''};
                                        //     tClassObj.name = 'NOTFOUND: ' + driver.axclass;
                                        // } else {
                                        //     tClassObj.name = eClass.axClass.name;
                                        //     tClassObj.index = eClass.axClass.index;
                                        //     tClassObj.category = eClass.axClass.category;
                                        //     tClassObj.description = eClass.axClass.description;
                                        //     tClassObj.isLadies = eClass.axClass.isLadies;
                                        //     tClassObj.isStock = eClass.axClass.isStock;
                                        //     tClassObj.paxClass = eClass.axClass.paxClass;
                                        // }
                                        // part.axClass = tClassObj;
                                        //console.log(part.axClass);
                                        // var tcls = lookupClass(driver.axclass);
                                        // if (tcls == null)
                                        //     part.axClass.name = driver.axclass;
                                        // else
                                        //     part.axClass = tcls;
                                        //part.axClass.name = driver.axclass;
                                        part.runGroup = { name: '', color: '' };
                                        part.workerRole = 'None';
                                        //TODO lookup class
                                        //console.log(driver);
                                        part.save(function (er) {
                                            var driverRunNumber = 0;
                                            var nrunClass = tClassObj;
                                            function doruns(rlist) {
                                                driverRunNumber++;
                                                //console.log('saving run');
                                                var nrlist = rlist;
                                                var prun = nrlist.shift();
                                                //console.log(prun);
                                                var nrun = new models.runs();
                                                runNumber++;
                                                nrun.eventId = ev._id;
                                                nrun.runNumber = runNumber;
                                                nrun.participantId = part._id;
                                                nrun.memberId = mem._id;
                                                nrun.driverRunNumber = driverRunNumber;
                                                nrun.club = { name: club.name, id: club._id };
                                                nrun.driver = drivero;
                                                nrun.runGroup = { name: 'Red', color: 'red' }
                                                nrun.session = 1;
                                                //console.log(eClass.axClass);
                                                nrun.axClass = nrunClass;
                                                // if (tcls == null)
                                                //     nrun.axClass.name = driver.axclass;
                                                // else
                                                //     nrun.axClass = tcls;
                                                nrun.status = 'F';
                                                nrun.rawTime = prun.rawTime;
                                                if (prun.rawTime > 0){
                                                    nrun.totalTime = (ev.conePenalty * prun.cones) + prun.rawTime;
                                                } else 
                                                    nrun.totalTime = 0;
                                                if (prun.rawTime > 0) {
                                                    nrun.paxTime = Math.floor((prun.rawTime +prun.cones) * part.axClass.index * 100000) / 100000 ;
                                                } else {nrun.paxTime = 0;}
                                                nrun.cones = prun.cones;
                                                nrun.isDnf = prun.isDnf;
                                                nrun.isOff = prun.isOff;
                                                nrun.getsRerun = prun.getsRerun;

                                                nrun.save(function (eru) {
                                                    if (eru) console.log('run.save error: ' + eru);
                                                    if (nrlist.length > 0)
                                                        doruns(nrlist);
                                                    else if (importedList.length > 0) {
                                                        part.totalRuns = driverRunNumber;
                                                        part.save();
                                                        console.log('finished part in ' + (new Date().getTime() - partstart) + 'ms');
                                                        //dopart(nlist);
                                                        doImport();
                                                    } else {
                                                        ev.participantCount = partcount;
                                                        ev.totalRuns = runNumber;
                                                        ev.save();
                                                        //res.send('done');
                                                        recalc();
                                                    }
                                                });
                                            }
                                            //console.log('do runs: ' + driver.runs.length);
                                            if (driver.runs.length > 0) {

                                                doruns(driver.runs);
                                            }
                                            else if (importedList.length > 0)
                                                doImport();
                                            else {
                                                ev.participantCount = partcount;
                                                ev.totalRuns = runNumber;
                                                ev.save();
                                                //res.send('done');
                                                recalc();
                                            }

                                        });// part.save
                                    }
                                    function doImport(){
                                        var driver = importedList.shift();
                                        console.log('doimport');
                                        if (driver === undefined){
                                            //all done
                                            ev.participantCount = partcount;
                                            ev.totalRuns = runNumber;
                                            ev.save();
                                            //res.send('done');
                                            recalc();
                                        } else {
                                            if (driver.fname != '' && driver.lname != '' && driver.carnumber != '') {
                                                // member lookup
                                                var mmbr = lookupMember(driver.clubMemberId, driver.fname, driver.lname, driver.carnumber);
                                                if (mmbr == null) {
                                                    // create new member
                                                    console.log('Creating new member record')
                                                    mm = new models.members();
                                                    mm.club = {name:club.name, id:club._id.toString()}
                                                    mm.firstName = driver.fname;
                                                    mm.lastName = driver.lname;
                                                    mm.clubMemberId = driver.clubMemberId;
                                                    mm.cars = [driver.car];
                                                    mm.lastAxClass = '';
                                                    mm.dedicatedNumber = '';
                                                    mm.clubRegion = '';
                                                    mm.dateCreated = new Date();
                                                    mm.dateUpdated = new Date();
                                                    mm.save(function(er){
                                                        addParticipant(mm, driver);
                                                    })
                                                }
                                                else {
                                                    addParticipant(mmbr, driver);
                                                }
                                            }
                                            else {
                                                doImport();
                                            }
                                        } // driver = undef
                                    }

                                    // function dopart(list) {
                                    //     var partstart = new Date().getTime();
                                    //     var nlist = list;
                                    //     var driver = nlist.shift();
                                    //     if (driver.fname != '' && driver.lname != '' && driver.carnumber != '') {
                                    //         partcount++;
                                    //         var part = new models.participants();
                                    //         var drivero = { name: driver.fname + ' ' + driver.lname, carNumber: driver.carnumber, car: { description: driver.car.description, year: driver.car.year, model: driver.car.model, make: driver.car.make, color: driver.car.color } };
                                    //         part.eventId = ev._id;
                                    //         part.club = { name: club.name, id: club._id };
                                    //         part.driver = drivero;
                                    //         var tcls = lookupClass(driver.axclass);
                                    //         if (tcls == null)
                                    //             part.axClass.name = driver.axclass;
                                    //         else
                                    //             part.axClass = tcls;
                                    //         //part.axClass.name = driver.axclass;
                                    //         part.runGroup = { name: '', color: '' };
                                    //         part.workerRole = 'None';
                                    //         //TODO lookup class
                                    //         //console.log(driver);
                                    //         part.save(function (er) {
                                    //             var driverRunNumber = 0;
                                    //             function doruns(rlist) {
                                    //                 driverRunNumber++;
                                    //                 var nrlist = rlist;
                                    //                 var prun = nrlist.shift();
                                    //                 //console.log(prun);
                                    //                 var nrun = new models.runs();
                                    //                 runNumber++;
                                    //                 nrun.eventId = ev._id;
                                    //                 nrun.runNumber = runNumber;
                                    //                 nrun.driverRunNumber = driverRunNumber;
                                    //                 nrun.club = { name: club.name, id: club._id };
                                    //                 nrun.driver = drivero;
                                    //                 nrun.runGroup = { name: 'Red', color: 'red' }
                                    //                 nrun.session = 1;
                                    //                 if (tcls == null)
                                    //                     nrun.axClass.name = driver.axclass;
                                    //                 else
                                    //                     nrun.axClass = tcls;
                                    //                 nrun.status = 'F';
                                    //                 nrun.rawTime = prun.rawTime;
                                                    
                                    //                 if (prun.rawTime > 0) {
                                    //                     nrun.paxTime = Math.floor((prun.rawTime +prun.cones) * part.axClass.index * 100000) / 100000 ;
                                    //                 } else {nrun.paxTime = 0;}
                                    //                 nrun.cones = prun.cones;
                                    //                 nrun.isDnf = prun.isDnf;
                                    //                 nrun.isOff = prun.isOff;
                                    //                 nrun.getsRerun = prun.getsRerun;

                                    //                 nrun.save(function (eru) {
                                    //                     if (nrlist.length > 0)
                                    //                         doruns(nrlist);
                                    //                     else if (nlist.length > 0) {
                                    //                         part.totalRuns = driverRunNumber;
                                    //                         part.save();
                                    //                         console.log('finished part in ' + (new Date().getTime() - partstart) + 'ms');
                                    //                         dopart(nlist);
                                    //                     } else {
                                    //                         ev.participantCount = partcount;
                                    //                         ev.totalRuns = runNumber;
                                    //                         ev.save();
                                    //                         //res.send('done');
                                    //                         recalc();
                                    //                     }
                                    //                 });
                                    //             }
                                    //             //console.log('do runs: ' + driver.runs.length);
                                    //             if (driver.runs.length > 0) {

                                    //                 doruns(driver.runs);
                                    //             }
                                    //             else if (nlist.length > 0)
                                    //                 dopart(nlist);
                                    //             else {
                                    //                 ev.participantCount = partcount;
                                    //                 ev.totalRuns = runNumber;
                                    //                 ev.save();
                                    //                 //res.send('done');
                                    //                 recalc();
                                    //             }

                                    //         });
                                    //     }
                                    //     else {
                                    //         if (nlist.length > 0)
                                    //             dopart(nlist);
                                    //         else {
                                    //             ev.participantCount = partcount;
                                    //             ev.totalRuns = runNumber;
                                    //             ev.save();
                                    //             //res.send('done');
                                    //             recalc();
                                    //         }
                                    //     }
                                    // }


                                    var tmp_path = file.path
                                        , heads = [];
                                    fs.readFile(tmp_path, 'utf8', function (er, data) {
                                        var lines = data.split(UNIVERSAL_NEWLINE);
                                        var output = [];
                                        if (lines.length > 1) {
                                            heads = lines[0].split('\t');
                                            for (var i = 1; i < lines.length; i++) {
                                                var cols = lines[i].split('\t');
                                                var p = new driver();
                                                for (var a = 0; a < cols.length; a++) {
                                                    switch (heads[a].trim().toLowerCase()) {
                                                        case 'member #':
                                                            p.clubMemberId = cols[a];break;
                                                        case 'first name':
                                                            p.fname = cols[a]; break;
                                                        case 'last name':
                                                            p.lname = cols[a]; break;
                                                        case 'number':
                                                            p.carnumber = cols[a]; break;
                                                        case 'class':
                                                            p.axclass = cols[a]; break;
                                                        case 'paid':
                                                            p.paid = cols[a] == 'Yes'; break;
                                                        case 'car color':
                                                            p.car.color = cols[a]; break;
                                                        case 'car model':
                                                            p.car.year = parseInt(cols[a].trim().substring(0, 4));
                                                            p.car.year = p.car.year > 1900 ? p.car.year : 0;
                                                            var card = '';
                                                            if (p.car.year > 0)
                                                                card = cols[a].substring(4).trim();
                                                            else
                                                                card = p.car.description = cols[a];

                                                            p.car.description = card;
                                                            var carda = card.trim().split(' ');
                                                            p.car.make = carda[0];
                                                            carda.shift();
                                                            p.car.model = carda.join(' ');
                                                            break;
                                                    }
                                                    if (heads[a].trim().match(/Run \d/i) != null) {
                                                        if (cols[a].trim() != '') {
                                                            //var runnum = parseInt(heads[a].trim().replace('Run ', ''));
                                                            var time = parseFloat(cols[a].trim());
                                                            var pen = cols[a + 1].trim();
                                                            var penp = parseInt(pen);
                                                            var r = new run();
                                                            r.rawTime = time;
                                                            r.cones = penp > 0 ? penp : 0;
                                                            r.isDnf = pen == 'DNF';
                                                            r.isOff = pen == 'OFF';
                                                            r.getsRerun = pen == 'RRN';
                                                            if (time > 0)
                                                                p.runs.push(r);
                                                        }
                                                    }
                                                } //loop cols
                                                parts.push(p);
                                                importedList.push(p);
                                            } //loop lines

                                            ev.participantCount = importedList.length;
                                            ev.save();
                                            doImport();
                                            //dopart(parts);

                                        } // lines > 1
                                    }); //readfile
                                }); //ev.save
                            }); // members.find
                        } // if clubseason
                        else { bad('No season setup.'); }
                    }); //models.season
                } else { bad('No club found.'); }
            }); //club
          
        
    });

    //import msr members
    app.get('/club/:clubname/msrimport', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname, allow = false;
        
             models.clubs.findOne({ "name": clubname}, function (err, d) {
                if (d) {
                    res.render('club_msrimport.jade', {title:'Import Members from MotorsportReg.com', message:null, clubname:clubname, club:d});
                }
                else {
                    res.sendfile('./public/Login.html');
                }
            });
        
           

    });



    // app.post('/club/:clubname/login', function (req, res) {
    //     var type = req.body.type
    //         , clubname = req.params.clubname
    //         , authd = false
    //         , pw = req.body.password
    //         , today = date1(new Date());
    //     //console.log(today);

    //     console.log('LOGIN');
    //     if (type == "guest") {
    //         //console.log('guest logging in');
            

    //         models.clubs.findOne({ "name": clubname, "guestPassword": pw }, function (err, d) {
    //             if (d) {
    //                 //console.log('club found');
    //                 models.events.findOne({ "club.name": clubname, date: today}, function (err, ev) {
    //                     if (ev) {
    //                         //console.log('event found');
    //                         req.session.auth = {role:"guest", clubname:clubname, eventid:ev._id};
    //                         //res.redirect('/event/' + ev._id);
    //                         res.render('event_home.jade', {
    //                             title: 'Logged In : AXti.me'
    //                             , isLive: true
    //                             , session: req.session
    //                             , event:ev
    //                         , settings:settings
    //                         });
    //                     } else {
    //                         //console.log('event NOT found');
    //                         res.sendfile('./public/Login.html');
    //                     }
    //                 });
    //             } else {
    //                 res.sendfile('./public/Login.html');
    //             }
    //         });
    //     } else if (type == "role") {
    //         //console.log('role login');
    //         var role = req.body.role;
    //         //console.log(today);
    //         models.events.findOne({ "club.name": clubname, "date":today }, function (err, ev) {
    //             if (ev) {
    //                 //console.log('event found');
    //                 var goto = false;
    //                 for (var w = 0; w < ev.workerRoles.length; w++) {
    //                     if (role == ev.workerRoles[w].role) {
    //                         //console.log('Role Found');
    //                         if (pw == ev.workerRoles[w].password) {
    //                             //console.log('pw good');
    //                             authd = true;
                                
    //                             break;
    //                         }
    //                     }
    //                 }
    //                 if (authd) {
    //                     req.session.auth = { role: role, clubname: clubname, eventid: ev._id };
    //                     //res.redirect('/event/' + ev._id);
    //                     res.render('event_home.jade', {
    //                         title: 'AXti.me'
    //                         , isLive: true
    //                         , session: req.session
    //                         , event: ev
    //                         , settings:settings
    //                     });
    //                 } else {
    //                     req.session.auth = null;
    //                     res.sendfile('./public/Login.html');
    //                 }
    //             }
    //             else {
    //                 req.session.auth = null;
    //                 res.sendfile('./public/Login.html');
    //             }
    //         });
    //     } else if (type == "admin") {
    //         //local admin login
    //         var un = req.body.username
    //             , pw = req.body.password
    //             , epw = axtime.encrypt(pw);

    //         models.users.findOne({ username: un, epassword: epw }, function (er, u) {
    //             //TODO save user info or id in session
    //             if (u) {
    //                 req.session.auth = { role: 'Club Admin', clubname: clubname, eventid: null };

    //                 res.redirect('/club/' + clubname);
    //             } else {
    //                 res.render('login_admin.jade', {
    //                     title: 'Login'
    //                     , message: 'Invalid username and/or password.'
    //                 });
    //             }
    //         });

            

    //     } else if (type == "account") {
    //         if ((req.body.email == 'ctrailer@repata.com' || req.body.email == 'guest@axti.me') && pw == 'pass') {

    //             models.clubs.findOne({ "name": clubname }, function (err, d) {
    //                 if (d) {

    //                     models.events.find({ "club.name": clubname }).sort({ 'date': -1 }).exec(function (err, evs) {

    //                         req.session.auth = { role: 'Club Admin', clubname: clubname, eventid: null };
    //                         //res.redirect('/club/' + clubname);
    //                         res.render('club_home.jade', {
    //                             title: clubname
    //                             , session: req.session
    //                             , events: evs
    //                             , club: d
    //                             , settings:settings
    //                         });
    //                     });
    //                 }
    //                 else {
    //                     req.session.auth = null;
    //                     res.sendfile('./public/Login.html');
    //                 }
    //             });
    //         } else {
    //             req.session.auth = null;
    //             res.redirect('/club/' + clubname + '/login?failed');
    //         }
    //     }
    //     else {
    //         req.session.auth = null;
    //         res.sendfile('./public/Login.html');
    //     }
    // });


    app.get('/club/:clubname/manageseasons', authorize(['Club Admin']), function (req, res) {
       
        var clubname = req.params.clubname, allow = false;


        
            models.clubs.findOne({ name: clubname }, function (er, club) {
                models.seasons.find({ clubId: club._id }).sort({seasonYear:-1}).exec(function (er1, seasons) {
                    res.render('club_manageseasons.jade', { title: 'Manage Seasons ', club: club, seasons:seasons, session:req.session });
                });
            });
        
    });

    app.get('/club/:clubname/copyseason', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname, allow = false;


        
            models.clubs.findOne({ name: clubname }, function (er, club) {
                models.seasons.find({ clubId: club._id }, function (er1, seasons) {
                    res.render('club_seasoncopy.jade', { title: 'Copy Seasons ', club: club, message:'', seasons:seasons, session:req.session });
                });
            });
       
       
    })

    app.post('/club/:clubname/copyseason', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname, allow = false;

        var newseason = req.body.newseason
            , seasonToCopy = req.body.seasontocopy;

            try {
                newseason = parseInt(newseason);

            } catch (ex){
                console.log('error converting newseason to int')
                newseason = 0;
            }
                
            models.clubs.findOne({ name: clubname }, function (er, club) {
                function endit(msg){
                    models.seasons.find({clubId:club._id}).sort({seasonYear:-1}).exec(function(er,seasons){
                        res.render('club_seasoncopy.jade', { title: 'Copy Seasons', message:msg, club: club, seasons:seasons, session:req.session });
                    });
                }

                if (newseason > 1973 && newseason < new Date().getFullYear() + 4) {
                    models.seasons.findOne({ clubId: club._id, seasonYear:newseason }, function (er1, seasonExists) {
                        if (seasonExists == null){
                            models.seasons.findOne({clubId:club._id, seasonYear:seasonToCopy}, function(er,season){
                                if (!er && season != null){
                                    console.log('copying new season')
                                    var ns = new models.seasons();
                                    ns.clubId = season.clubId;
                                    ns.seasonYear = newseason;
                                    ns.classPoints = season.classPoints;
                                    ns.paxPoints = season.paxPoints;
                                    ns.classes = season.classes;
                                    ns.paxClasses = season.paxClasses;
                                    ns.totalEvents = 0;
                                    ns.paxMaxEvents = season.paxMaxEvents;
                                    ns.classMaxEvents = season.classMaxEvents;
                                    ns.conePenalty = season.conePenalty;
                                    ns.save(function(er){
                                        if (er)
                                            endit('Errors occurred while saving the new season. ' + er);
                                        else
                                            res.redirect('/club/' + club.name + '/manageseasons');
                                    })

                                } else {
                                    endit('The season you are trying to copy does not exist.');
                                }
                            })
                        }
                        else {
                            endit('That season already exists');
                        }
                        
                    });
                } else {
                    endit('Invalid Year.  Must be four digits and between 1973 and ' + (new Date().getFullYear() + 4))
                }
            });
       
       
    })

    app.get('/club/:clubname/season/:year', authorize(['Club Admin']), function (req, res) {

        var clubname = req.params.clubname, year = req.params.year, allow = false;

            models.clubs.findOne({ name: clubname }, function (er, club) {
                models.seasons.findOne({ clubId: club._id, seasonYear: year }, function (er1, season) {
                    if (season) {
                        var classes = [];
                        var cls = season.classes;
                        for (var i = 0; i < season.classes.length; i++) {
                            classes.push({ name: cls[i].name, index: cls[i].index, isLadies: cls[i].isLadies, isStock: cls[i].isStock });
                        }
                        res.render('club_season.jade', { title: 'Manage Season ' + year, club: club, season: season,classes:classes, session:req.session });
                    }
                    else
                        res.send('invalid year');
                });
            });
        
    });

    app.get('/club/:clubname/newseason', authorize(['Club Admin']), function (req, res) {

        var clubname = req.params.clubname, allow = false;

        var pp = [];
        pp.push(100);
        pp.push(94);
        pp.push(88);
        pp.push(82);
        pp.push(77);
        pp.push(72);
        pp.push(68);
        pp.push(64);
        pp.push(60);
        pp.push(56);
        pp.push(52);
        pp.push(48);
        pp.push(44);
        pp.push(40);
        pp.push(36);
        pp.push(32);
        pp.push(29);
        pp.push(26);
        pp.push(23);
        pp.push(20);
        pp.push(18);
        pp.push(16);
        pp.push(14);
        pp.push(12);
        pp.push(10);
        pp.push(8);
        pp.push(6);
        pp.push(4);
        pp.push(2);
        pp.push(1);

        var ccp = [];
        ccp.push(20);
        ccp.push(16);
        ccp.push(13);
        ccp.push(11);
        ccp.push(9);
        ccp.push(7);
        ccp.push(5);
        ccp.push(3);
        ccp.push(2);
        ccp.push(1);

        
            models.clubs.findOne({ name: clubname }, function (er, club) {
                res.render('club_newseason.jade', { title: 'New Season ', club: club, pp:pp, cp:ccp });
            });
        
    });



    app.get('/club/:clubname/newevent', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname, allow = false, year = new Date().getFullYear();


            models.clubs.findOne({ name: clubname }, function (er, club) {
                if (club) {
                    models.events.find({ 'club.name': clubname, season: year, countForPoints:true}).select('_id eventNumber').sort({ 'date': -1 }).exec(function (er, evs) {
                        var nextNum = 1;
                        if (evs.length > 0) {
                            nextNum = evs[0].eventNumber + 1;
                        }
                        res.render('newevent.jade', { title: 'New Event: ' + clubname, runGroups:models.runGroups, club: club, roles:models.roles, stations:models.stations, nextEventNumber:nextNum, session:req.session });
                    });
                }
                else {
                    res.send("Club not in system");
                }
            });
       
    });


    app.get('/club/:clubname', function (req, res) {
        //list events, etc. (index.html)
        var clubname = req.params.clubname, allow = false;
        
        if (settings.isLocal) {
            models.clubs.findOne({ name: clubname }, function (er, club) {
                if (club) {
                    var message = null, dbUpgrade = false;
                    if (club.dbVersion == null || club.dbVersion != dbVersion){
                        message = 'You need to upgrade your database before continuing!';
                        dbUpgrade = true;
                    }
                    var doVersionCheck = false;
                    if ((new Date().getTime() - (club.lastVersionCheck || 0)) > 3600000){
                        doVersionCheck = true;
                    }
                    models.events.find({ 'club.name': clubname }).select('_id date season name location participantCount totalRuns').sort({ 'date': -1 }).exec(function (er, evs) {
                        evs.sort(function (a, b) { return new Date(a.date) > new Date(b.date) ? -1 : 1; });
                        res.render('club_home.jade', { title: clubname, club: club, events: evs, session: req.session
                            , settings:settings, message:message, dbUpgrade:dbUpgrade, doVersionCheck:doVersionCheck });
                    });
                }
                else {
                    res.send("Club not in system");
                }
            });
            
        }
        else {
            
                models.clubs.findOne({ name: clubname }, function (er, club) {
                    if (club) {
                        models.events.find({ 'club.name': clubname }).sort({ 'date': -1 }).exec(function (er, evs) {
                            res.render('club_home.jade', { title: clubname, club: club, events: evs, session: req.session
                            , settings:settings });
                        });
                    }
                    else {
                        res.send("Club not in system");
                    }
                });
           
        }
        
    });

    
    app.get('/club/:clubname/classimport_axware', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname;
        //TODO error handling
        models.clubs.findOne({name:clubname}, function(er, club){
            models.seasons.find({'clubId':club.id}, function(er,seasons){
                res.render('classimport_axware.jade', { title: 'Import AXWare Classes',club:club, seasons:seasons, classes:[], paxClasses:[], message:'' });
            })
        })
    });

    app.post('/club/:clubname/classimport_axware', authorize(['Club Admin']), function (req, res) {
        var clubname = req.params.clubname;
        var seasonId = req.body.seasonId;
        var allow = false;



            //TODO error handling
            var csvfile = req.files.csvfile;
            
            models.clubs.findOne({name:clubname}, function(er, club){
                function end(s, p, c, m){
                    res.render('classimport_complete.jade', { title: 'Import AXWare Classes'
                        , club:club, seasons:s, classes:c, paxClasses:p, message:m });
                }
                models.seasons.findById(seasonId, function(er,season) {

                    if (season) {
                        var tmp_path = csvfile.path;
                        var classes = [];
                        var paxClasses = [];

                        fs.readFile(tmp_path, 'utf8', function (er, data) {
                            var lines = data.split(UNIVERSAL_NEWLINE);

                            for (var i=0;i<lines.length;i++){
                                var cols = lines[i].split('\t');
                                var cls = {
                                    name:null
                                    , description:''
                                    , index:0.0
                                    , category:''
                                    , note:''
                                    , n:''
                                    , include:true
                                }
                                var paxCls = {
                                    name:null
                                    , isLadies:false
                                    , isStock:false
                                    , category:''
                                    , description:''
                                }
                                if (cols.length > 7){
                                    if (cols[6] != 'exclude')
                                    {
                                        if (cols[4].toLowerCase()=='pax') // pax class 
                                        {
                                            paxCls.name = cols[0].toUpperCase().replace('-','');
                                            paxCls.description = cols[3];
                                            paxCls.category = cols[7];
                                            if (paxCls.description.toLowerCase().indexOf('ladies') > -1)
                                                paxCls.isLadies = true;
                                            paxClasses.push(paxCls);
                                        } else {
                                            cls.name = cols[0].toUpperCase().replace('-','');
                                            cls.index = cols[1];
                                            cls.description = cols[3];
                                            cls.category = cols[7];
                                            cls.n = cols[2];
                                            cls.include = cols[5] != 'nopoints';
                                            if (cls.description.toLowerCase().indexOf('ladies') > -1)
                                                cls.isLadies = true;
                                            classes.push(cls);
                                        }
                                    }
                                }
                            } // for lines

                            classes.sort(function(a,b){
                                if (a.category == b.category){
                                    return a.name < b.name ? -1 : 1;
                                }
                                return a.category < b.category ? -1 : 1;
                            })
                            season.classes = classes;
                            season.paxClasses = paxClasses;
                            season.save(function(er){
                                end([], paxClasses, classes, '');
                            });

                            
                            //res.render('classimport_axware.jade', { title: 'Import AXWare Classes', seasons:[], classes:[], paxClasses:[] });
                        }); // read upload file

                    } else {
                        end([], [],[],'Invalid season.');
                    }
                    
                })
            })
        
    });

    app.get('/club/:clubname/newmember', authorize(['Club Admin']), function (req, res) {
        var eid = req.query.eid
            , clubname = req.params.clubname;
        
            models.clubs.findOne({name:clubname}, function(er, club){
                res.render('member_edit.jade', { title: 'Create New Member', club:club, message:null });
            });
        
    });
    app.get('/club/:clubname/membermerge/:mid', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname
            , memberId = req.params.mid;
        
            models.clubs.findOne({name:clubname}, function(er, club){
                models.members.findById(memberId, function(er, member){
                    models.participants.find({memberId: memberId}, function(er, parts){
                        models.members.find({'club.id': club._id}).sort({'lastName':1}).exec(function(er, members){
                            res.render('member_merge.jade', {title:'Member Merge', club:club, member:member, parts:parts, members:members})
                        })
                    });
                });
            });
        
    });

    app.get('/club/:clubname/member/:mid', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname
            , memberId = req.params.mid;
        
        
            models.clubs.findOne({name:clubname}, function(er, club){
                models.members.findById(memberId, function(er, member){
                    models.participants.find({memberId: memberId}, function(er, parts){
                        var eventIds = [];
                        if (parts.length > 0){
                            for (var i in parts){
                                eventIds.push(parts[i].eventId.toString());
                            }
                        }
                        
                        models.events.find({'club.id':club._id}).where('_id').in(eventIds).exec(function(er, events){
                            console.log('events found: ' + events.length);
                            for (var i in parts){
                                for (var ev in events){
                                    if (parts[i].eventId.toString() == events[ev]._id.toString()){
                                        parts[i].eventName = events[ev].name;
                                        parts[i].eventDate = events[ev].date;
                                        parts[i].eventLocation = events[ev].location.name;
                                        break;
                                    }
                                }
                            }
                            res.render('member.jade', {title:'Member Info',club:club, member:member, message:null, participants:parts, session:req.session});
                        })
                    })
                })
            })
        
    });


    app.post('/club/:clubname/member/:mid', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname
            , memberId = req.params.mid;


            if (req.body.dodelete == 'Yes, Delete')
            {
                // delete
                console.log('DELETE member ' + memberId);
                var del = models.members.findById(memberId);
                del.remove(function(er){
                    //res.send('deleted ' + memberId);
                    res.redirect('/club/' + clubname + '/members');
                })
                return;
            }

            console.log('member edit: ' + memberId);
            var firstName = req.body.firstName
                , lastName = req.body.lastName
                , isMember = req.body.isMember == 'yes'
                , clubMemberId = req.body.clubMemberId
                , dedicatedNumber = req.body.dedicatedNumber
                , lastAxClass = req.body.lastAxClass
                , lastPaxClass = req.body.lastPaxClass
                , clubRegion = req.body.region
                , mailNewsLetter = req.body.mailNewsLetter == 'yes'
                , emailNewsLetter = req.body.emailNewsLetter == 'yes'
                , currentEmail = req.body.currentEmail
            ;

            models.clubs.findOne({name:clubname}, function(er, club){
                function error(msg){
                    console.log('error called: ' + msg);
                    if (memberId == 'new'){
                        var member = {};
                        member.id = 'new';
                        member.addresses = [];
                        member.cars = [];
                        member.phones = [];
                        member.emails = [];
                        member.sponsors = [];
                        member.msrId = '';
                        member.firstName = firstName;
                        member.lastName = lastName;
                        member.isMember = clubMemberId.length > 0;
                        member.clubMemberId = clubMemberId;
                        member.dedicatedNumber = dedicatedNumber;
                        member.lastAxClass = lastAxClass;
                        member.lastPaxClass = lastPaxClass;
                        member.clubRegion = clubRegion;
                        member.mailNewsLetter = mailNewsLetter;
                        member.emailNewsLetter = emailNewsLetter;
                        member.currentEmail = currentEmail;

                        res.render('member.jade', {title:'Save Member info',club:club,member:member, message:msg,participants:[]});
                    } else {
                        models.members.findById(memberId, function(er, member){                    
                            res.render('member.jade', {title:'Save Member info',club:club, member:member, message:msg, participants:[]});
                            
                        })
                    }
                        
                }
                function save(){
                    console.log('saving')
                    if (memberId == 'new'){
                        console.log('creating new member')
                        var member = new models.members();
                        member.club = {id:club._id, name:club.name}
                        member.firstName = firstName;
                        member.lastName = lastName;
                        member.isMember = clubMemberId.length > 0;
                        member.clubMemberId = clubMemberId;
                        member.dedicatedNumber = dedicatedNumber;
                        member.lastAxClass = lastAxClass;
                        member.lastPaxClass = lastPaxClass;
                        member.clubRegion = clubRegion;
                        member.mailNewsLetter = mailNewsLetter;
                        member.emailNewsLetter = emailNewsLetter;
                        member.currentEmail = currentEmail;
                        member.save(function(er){
                            res.redirect('/club/' + club.name + '/members');
                        })
                    } else {
                        console.log('updating member');
                        models.members.findById(memberId, function(er, member){
                            if (!er && member != null){
                                member.firstName = firstName;
                                member.lastName = lastName;
                                member.isMember = isMember;
                                member.clubMemberId = clubMemberId;
                                member.dedicatedNumber = dedicatedNumber;
                                member.lastAxClass = lastAxClass;
                                member.lastPaxClass = lastPaxClass;
                                member.clubRegion = clubRegion;
                                member.mailNewsLetter = mailNewsLetter;
                                member.emailNewsLetter = emailNewsLetter;

                                if (member.currentEmail != currentEmail && member.currentEmail.length > 0){
                                    // var emails = [];
                                    // for (var i = 0; i < member.emails.length; i++) {
                                    //     emails.push(member.emails[i])
                                    // };
                                    member.emails.push({address:member.currentEmail.toString()});
                                }
                                member.currentEmail = currentEmail;

                                member.save(function(er){
                                    res.redirect('/club/' + club.name + '/members');
                                })
                            }
                            else {
                                console.log('member not found')
                                res.render('member.jade', {title:'Member Info',club:club, member:member, message:er, participants:[]});
                            }
                        })
                    }
                }

                if (firstName.length == 0 || lastName.length == 0) {
                    error('First and/or Last name cannot be blank or empty.');
                }
                //lookup existing car number
                else if (dedicatedNumber.length > 0 && lastAxClass.length > 0){
                    var find = {'club.id':club._id, dedicatedNumber:dedicatedNumber}
                    if (club.uniqueNumberPerClass){
                        find = {'club.id':club._id, dedicatedNumber:dedicatedNumber, lastAxClass:lastAxClass, lastPaxClass:lastPaxClass}
                    } 

                    if (memberId == 'new'){
                         models.members.find(find)
                            .exec(function(er, duplicateMember){
                                if (!er){
                                    if (duplicateMember.length > 0){
                                        error('The dedicated # is already reserved for ' + duplicateMember[0].firstName + ' ' + duplicateMember[0].lastName);
                                    }
                                    else {
                                        save();
                                    }
                                }
                                else {
                                    error(er);
                                }
                            })
                    } else {
                         models.members.find(find)
                            .where('_id').ne(memberId)
                            .exec(function(er, duplicateMember){
                                if (!er){
                                    if (duplicateMember.length > 0){
                                        error('The dedicated # is already reserved for ' + duplicateMember[0].firstName + ' ' + duplicateMember[0].lastName);
                                    }
                                    else {
                                        save();
                                    }
                                }
                                else {
                                    error(er);
                                }
                            })
                    }
                }
                else {
                    save();
                }
                
            })
        
    });

    app.get('/club/:clubname/members', function(req,res){
        //TODO error handling
        var clubname = req.params.clubname;
        models.clubs.findOne({name:clubname}, function(er, club){
            models.members.find({'club.id':club.id}).exec(function(er, members){
                members.sort(function(a,b){
                    var aa = a.lastName.toLowerCase()
                        , bb = b.lastName.toLowerCase();

                    if (aa == bb) {
                        return a.firstName.toLowerCase() < b.firstName.toLowerCase() ? -1 : 1;
                    }
                    else {
                        return aa < bb ? -1 : 1;
                    }
                })
                res.render('members.jade', {title:'Member Directory', club:club, members:members, session:req.session})
            })
            
        })
    })


    //csv or axware membership import

    app.get('/club/:clubname/memberimport', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname;
        models.clubs.findOne({name:clubname}, function(er, club){
            models.members.find({'club.id':club.id}).sort({lastName:1}).exec(function(er, members){
                res.render('memberimport.jade', {title:'Membership', newMembers:[], club:club, session:req.session})
            })
        })
    });

    app.post('/club/:clubname/memberimport', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname
            , allow = false
            , overwriteMember = false // not used yet
        ;

        

        //TODO validation
        
            var csvfile = req.files.csvfile;
            var cols = [];
            var members = [];
            var newMembers = [];
            models.clubs.findOne({ "name": clubname }, function (err, club) {
                var yyr = new Date().getFullYear();
                models.seasons.findOne({seasonYear:yyr})
                if (!err){
                    console.log('club found:' + club.id);
                    var tmp_path = csvfile.path;
                    fs.readFile(tmp_path, 'utf8', function (er, data) {
                        //TODO  split on universal newline 
                        var lines = data.split(UNIVERSAL_NEWLINE);
                        var output = [];
                        if (lines.length > 1) {
                            cols = parseCSVLine(lines[0],'\t')[0];
                            var count = 0;
                            for (var i = 1; i < lines.length; i++) {
                                var mm = new models.members();
                                mm.club = {id:club._id, name:club.name};
                                var items = parseCSVLine(lines[i],'\t')[0];
                                count++;
                                var car = {make:'',model:'', year:0,color:''}
                                var addr = {street:'', city:'', state:'',zip:''}
                                var phones = [];
                                var sponsors = [];
                                var emails = [];
                                mm.lastName = '';
                                mm.firstName = '';
                                for (var a = 0; a < items.length; a++) {
                                    switch (cols[a].trim().toLowerCase()) {
                                        case 'first name':
                                            mm.firstName = items[a]; break;
                                        case 'last name':
                                            mm.lastName = items[a]; break;
                                        case 'number':
                                            mm.dedicatedNumber = items[a]; break;
                                        case 'class':
                                            var tcls = items[a].toUpperCase()
                                                , axclass = tcls
                                                , paxclass = '';
                                            if (tcls.indexOf('-') > -1){
                                                axclass = tcls.split('-')[1];
                                                paxclass=tcls.split('-')[0];
                                            }
                                            mm.lastAxClass = axclass;
                                            mm.lastPaxClass = paxclass;
                                            break;
                                        case 'car make':
                                            car.make = items[a];break;
                                        case 'car model':
                                            items[a] = items[a].trim();
                                            //TODO clean this shit up
                                            if (items[a].indexOf(' ') == 2 && parseInt(items[a].substring(0,2)) > -1)
                                            {
                                                
                                                var carspl = items[a].split(' ');
                                                var yr = carspl[0];
                                                if (yr.substring(0,1) == '0') 
                                                    yr = yr.substring(1,2);

                                                if (parseInt(yr) > 40)
                                                    car.year = 1900 + parseInt(yr);
                                                else
                                                    car.year = 2000 + parseInt(yr);
                                                car.make = carspl[1];
                                                car.model = carspl[2];
                                                break;
                                            }
                                            else if (items[a].indexOf(' ') == 4 && parseInt(items[a].substring(0,4)) > 0)
                                            {
                                               
                                                var carspl = items[a].split(' ');
                                                car.year = parseInt(carspl[0]);
                                                car.make = carspl[1];
                                                car.model = carspl[2];
                                                break;
                                            }
                                            else {
                                               
                                                car.model = items[a];
                                                break;
                                            }
                                        case 'car year':
                                            car.year = items[a];break;
                                        case 'car color':
                                            car.color = items[a];break;
                                        case 'member':
                                            mm.isMember = (',yes,true,1,').indexOf(','+items[a].toLowerCase()) >-1 ;break;
                                        case 'mail':
                                            mm.mailNewsLetter = (',yes,true,1,').indexOf(','+items[a].toLowerCase()) >-1 ;break;
                                        case 'address':
                                           addr.street = items[a];break;
                                        case 'city':
                                           addr.city = items[a];break;
                                        case 'state':
                                           addr.state = items[a];break;
                                        case 'zip':
                                           addr.zip = items[a];break;
                                        case 'home':
                                            if (items[a] != '')
                                                phones.push({phoneType:'home', number:items[a]});
                                            break;
                                        case 'work':
                                            if (items[a] != '')
                                                phones.push({phoneType:'work', number:items[a]});
                                            break;
                                        case 'cell':
                                            if (items[a] != '')
                                                phones.push({phoneType:'mobile', number:items[a]});
                                            break;
                                        case 'member #':
                                            mm.clubMemberId = items[a];break;
                                        case 'sponsor':
                                            var tspon = items[a].split(',');
                                            for (var n=0;n<tspon.length;n++){
                                                if (tspon[n] != '')
                                                    sponsors.push({name:tspon[n]});
                                            }
                                            break;
                                        case 'region':
                                            mm.clubRegion = items[a];break;
                                        case 'email':
                                            if (items[a] != '')
                                                //emails.push({address:items[a]});
                                            mm.currentEmail = items[a];
                                            break;
                                        case 'email #1':
                                            if (items[a] != '')
                                                emails.push({address:items[a]});
                                            break;
                                        case 'email #2':
                                            if (items[a] != '')
                                                emails.push({address:items[a]});
                                            break;

                                    }


                                }

                                car.description = car.color + (car.year > 0 ?(' ' + car.year) : '') + ' ' + car.make + ' ' + car.model;
                                mm.cars = [car];

                                //TODO REMOVE ME
                                //phones.push({phoneType:'mobile', number:'415-738-8401'})
                                //phones.push({phoneType:'work', number:'415-555-1212'})

                                mm.phones = phones;
                                mm.sponsors = sponsors;
                                if (addr.street == '' && addr.city == '' && addr.state == '' && addr.zip == '')
                                    mm.addresses = [];
                                else {
                                    addr.addrType = 'home';

                                    mm.addresses = [addr];
                                }

                                //TODO REMOVE ME
                                //mm.addresses.push({addrType:'work', street:'49 Politzer Dr', city:'Menlo Park', state:'CA', zip:'94025'})
                                //mm.addresses.push({addrType:'home', street:'374 11th Street', city:'San Francisco', state:'CA', zip:'94103'})

                                //emails.push({address:'ctrailer@repata.com'});
                                //emails.push({address:'ctrailer@axti.me'})
                                mm.emails = emails;
                                if (mm.firstName && mm.lastName){
                                    mm.save();
                                    newMembers.push(mm);
                                }
                                //TODO do member lookup and overwrite or 
                                //console.log('saving new member');

                            }
                        }
                        newMembers.sort(function(a,b){
                            if (a.lastName == b.lastName) {
                                if (a.firstName == b.firstName) return 0;
                                return a.firstName < b.firstName ? -1 : 1;
                            };
                            return a.lastName < b.lastName ? -1 : 1;
                        })
                        res.render('memberimport.jade', {title:'Member Import', club:club, newMembers:newMembers, session:req.session})
                    });
                } // if club err
                else {

                }
            });
        
        
    })

    // app.get('/event/login/:id', function (req, res) {
    //     var eid = req.params.id;
    //     models.events.findOne({ _id: eid }, function (err, ev) {
    //         if (ev) {
    //             res.render('login_local.jade', {
    //                 title: 'Event Login'
    //                 , eventid: req.params.id
    //                 , message: null
    //                 , event:ev
    //             });
    //         }
    //     });
    // });

    // app.post('/event/login/:id', function (req, res) {
    //     var eid = req.params.id
    //         , role = req.body.role
    //         , pw = req.body.password
    //         , today = date1(new Date())
    //         , authd = false;
    //     models.events.findOne({ _id:eid }, function (err, ev) {
    //         if (ev) {
    //             //console.log('event found');
    //             var clubname = ev.club.name;
    //             var goto = false;
    //             for (var w = 0; w < ev.workerRoles.length; w++) {
    //                 if (role == ev.workerRoles[w].role) {
    //                     console.log('Role Found');
    //                     if (pw == ev.workerRoles[w].password) {
    //                         console.log('pw good');
    //                         authd = true;

    //                         break;
    //                     }
    //                 }
    //             }
    //             if (authd) {
    //                 req.session.auth = { role: role, clubname: clubname, eventid: ev._id };
    //                 //res.redirect('/event/' + ev._id);
    //                 res.render('event_home.jade', {
    //                     title: 'AXti.me'
    //                     , isLive: true
    //                     , session: req.session
    //                     , event: ev
    //                     , settings:settings
    //                 });
    //             } else {
    //                 //req.session.auth = { role: '', clubname: clubname, eventid: ev._id };
    //                 //res.sendfile('./public/Login.html');
    //                 console.log('login invalid.');
    //                 res.render('login_local.jade', { title: 'Event Login', eventid:eid, event:ev, message:'Password is not valid.' });
    //             }
    //         }
    //         else {
    //             //req.session.auth = null;
    //             //TODO send to 404 or error page
    //             res.sendfile('./public/Login.html');
    //         }
    //     });

    // });
    
    app.get('/event/oncourse/:id', function(req, res){
        var eid = req.params.id;
        models.events.findById(eid, function (er, ev) {
            if (er || !ev) res.send('No event or error. ' + er);
            else
                res.render('event_oncourse.jade', {title:'On course', session:req.session, event:ev})
        });
    })


    app.get('/event/chrono/:id', function(req, res){
        var eid = req.params.id;
        models.events.findById(eid, function (er, ev) {
            if (er || !ev) res.send('No event or error. ' + er);
            else
                res.render('event_timerdisplay.jade', {title:'Chrono Mode', session:req.session, event:ev})
        });
    })

    app.get('/event/manualtimer/:id', authorize(['Club Admin','Event Admin','Time Keeper']), function(req,res){
        var eid = req.params.id
            , allow = false;

            models.events.findById(eid, function (er, ev) {
                if (er || !ev) res.send('No event or error. ' + er);
                else
                    res.render('manualtimer.jade', {title:'Manual Timer', session:req.session, event:ev})
            // models.clubs.findOne({ "name": clubname }, function (err, d) {
            //     if (d) {
            //         res.render('manualtimer.jade', {title:'Manual Timer', session:req.session, club:d})
            //     } else {
            //         res.send('Invalid request.');
            //     }
            });
        
    })
    app.get('/event/runs/:eventid', function (req, res) {
        var eid = req.params.eventid, allow = false;
        models.events.findOne({ _id: eid }, function (ere, ev) {
            if (ere || !ev) { res.render('error.jade',{message:'Event does not exist.'}) }
            else {
                models.participants.find({eventId: eid}, function(er, parts){
                    models.seasons.findOne({clubId: ev.club.id}, function(er,season){
                        models.runs.find({ eventId: eid, status:'F' }).sort({ runNumber: -1 }).exec(function (er, runs) {
                            res.render('runs.jade', {
                                title: 'Runs'
                                , runs: runs
                                , event:ev
                                , participants:parts
                                , season:season
                                , session:req.session
                            });
                        });
                    });
                });
            }
        });
    });
    // app.get('/event/times/:eventid', function (req, res) {
    //     var eid = req.params.eventid, allow = false;
    //     models.times.find({ eventId: eid }).sort({timestamp:-1}).exec(function (ere, times) {
    //         res.render('times.jade', {title:'Raw Times Data', eventId:eid, times:times});
    //     });
    // });

    app.get('/event/:eventid/printlabel/:pid', function(req,res){
        var eid = req.params.eventid
            , pid = req.params.pid;

        models.events.findById(eid, function(er, event){
            models.clubs.findById(event.club.id, function(er, club){
                models.participants.findById(pid, function(er, participant){
                    //TODO only print if part is checked in
                    res.render('print_participant_label.jade', {club:club, event:event, participant:participant, session:req.session})
                })
            })
        })
    })

    app.get('/event/registration/:id', authorize(['Club Admin','Event Admin','Time Keeper','Registrar']), function (req, res) {
        //res.sendfile('./public/EventRegistration.html');
        var eid = req.params.id, allow = false;

            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    var yr = new Date(ev.date).getFullYear();
                    //console.log(yr);
                    models.seasons.find({ clubId: ev.club.id, seasonYear: ev.season }, function (err4, season) {
                        if (season.length == 1) {
                            season[0].classes.sort(function(a,b){
                                return a.name < b.name ? -1 : 1;
                            });
                            res.render('eventregistration.jade', {
                                event: ev, title: ev.name + ' Registration'
                                , session: req.session
                                , classes: season[0].classes
                                , paxClasses: season[0].paxClasses
                            });
                        } else {
                            
                            res.send('No season configured.');
                        }
                    });
                } else {
                    res.redirect('/NoAccess.html');
                }
            });
        
    });

    app.get('/event/registration2/:id', authorize(['Club Admin','Event Admin','Time Keeper','Registrar']), function (req, res) {
        //res.sendfile('./public/EventRegistration.html');
        var eid = req.params.id, allow = false;

            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    var yr = new Date(ev.date).getFullYear();
                    //console.log(yr);
                    models.seasons.find({ clubId: ev.club.id, seasonYear: ev.season }, function (err4, season) {
                        if (season.length == 1) {
                            res.render('event/event_registration.jade', {
                                event: ev, title: ev.name + ' Registration'
                                , session: req.session
                                , classes: season[0].classes
                                , paxClasses: season[0].paxClasses
                            });
                        } else {
                            
                            res.send('No season configured.');
                        }
                    });
                } else {
                    res.redirect('/NoAccess.html');
                }
            });
       
    });

    app.get('/event/times/:id', authorize(['Club Admin','Event Admin','Time Keeper']), function (req, res) {
        var eid = req.params.id;
        //TODO auth
        models.events.findOne({ "_id": eid }, function (err, ev) {

            if (ev) {
                models.times.find({ eventId: eid }).sort({'timestamp':-1}).exec(function (er, times) {
                    res.render('eventtimes.jade', { title: 'Event Raw Times', times: times, event:ev, session:req.session });
                });
            }
            else {
                res.send('Event not found.');
            }
        });
    });

    app.get('/event/coursemap/:id', function (req, res) {
        var eid = req.params.id, allow = false;
        //TODO auto user to event and role (or let anyone upload, need to make system handle multiple images)
        models.events.findOne({ "_id": eid }, function (err, ev) {

            if (ev) {
                res.render('coursemap_upload.jade', { title: 'Course Map Upload',message:null, event: ev, url:null });
            }
            else {
                res.send('Event not found.');
            }
        });

    });
    app.post('/event/coursemap/:id', function (req, res) {
        var eid = req.params.id, allow = true;
        //if (req.session.auth) {
        //    if (req.session.auth.eventid == eid || req.session.auth.role == 'Club Admin') {
        //        switch (req.session.auth.role) {
        //            case "Club Admin":
        //                allow = true;
        //                break;
        //            case "Event Admin":
        //                allow = true;
        //                break;

        //        }
        //    }
        //}
        if (allow) {

            var file = req.files.coursemap;
            var cols = [];
            var parts = [];
            models.events.findOne({ "_id": eid }, function (err, ev) {
                if (ev){
                    var splitChar = file.path.indexOf('/') > -1 ? '/' : '\\';
                    console.log('file.path');
                    console.log(file.path);
                    var tmp_path = file.path
                        , filename = path.basename(tmp_path)
                        , newpath = path.resolve(tmp_path)
                        , url = '/uploads/' + filename
                        , cm = { url: url, designer: '', path: newpath };
                    console.log('filename: ' + filename);
                    console.log('file path: ' + tmp_path);
                    console.log('url: ' + url);
                    //fs.createReadStream(tmp_path).pipe(fs.createWriteStream(newpath));
                    ev.courseMap = { url: url, designer: '', path: newpath };
                    ev.save();
                    res.render('coursemap_upload.jade', { title: 'Course Map Upload', event: ev, message:'Image uploaded successfully.', url:url });
                }
                else {
                    res.send('Event not found.');
                }
            });

        }
    });


    app.get('/event/exports/:id', function (req, res) {
        var eid = req.params.id, allow = false;
        //TODO auto user to event and role (or let anyone upload, need to make system handle multiple images)
        models.events.findOne({ "_id": eid }, function (err, ev) {

            if (ev) {
                res.render('event_exports.jade', { title: 'Export Event', event:ev});
            }
        });

    });


    app.get('/event/printables/:id', function (req, res) {
        var eid = req.params.id, allow = false;
        //TODO auto user to event and role (or let anyone upload, need to make system handle multiple images)
        models.events.findOne({ "_id": eid }, function (err, ev) {

            if (ev) {
                res.render('event_printables.jade', { title: 'Event Printables', event: ev });
            }
        });

    });


    app.get('/event/:id/rungroupbyclass', authorize(['Club Admin','Event Admin','Time Keeper','Registrar']), function(req,res){
        var eid = req.params.id, allow = false;
        
            models.events.findOne({ "_id": eid }).select('_id club season classRunGroups runGroups name date dateInt').exec(function (er, ev) {
                if (er) res.send('Invalid event');

                models.seasons.findOne({seasonYear:ev.season, clubId:ev.club.id}, function(er, season){
                    if (er) res.send('Invalid season');
                    if (ev) {
                        models.participants.find({eventId:ev._id}, function(er, parts){
                            if (er) res.send('Invalid participants');
                            else {
                                
                                var classRunGroups = [];
                                var paxClasses = season.paxClasses ;
                                var classes = season && season.classes ? season.classes : [];
                                
                                if (ev.classRunGroups && ev.classRunGroups.length === 0){
                                    for (var i = 0; i < paxClasses.length; i++) {
                                        var n = paxClasses[i].name;
                                        classRunGroups.push({runGroup:'', paxClass:n, baseClass:'', count:0})
                                    };
                                    for (var i = 0; i < season.classes.length; i++) {
                                        var n = season.classes[i].name;
                                        classRunGroups.push({runGroup:'', paxClass:'', baseClass:n, count:0})
                                    };
                                }
                                else if (ev.classRunGroups) {
                                    for (var i = 0; i < ev.classRunGroups.length; i++) {
                                        var itm = ev.classRunGroups[i];
                                        classRunGroups.push({runGroup:itm.runGroup, baseClass:itm.baseClass, paxClass:itm.paxClass, count:0});
                                    };
                                    for (var i = 0; i < season.classes.length; i++) {
                                        var cn = season.classes[i].name;
                                        var exists = false;
                                        for (var i = 0; i < classRunGroups.length; i++) {
                                            if (classRunGroups[i].baseClass == cn){
                                                exists = true;
                                                break;
                                            }
                                        };
                                        if (!exists){
                                            classRunGroups.push({baseClass:cn, paxClass:'', runGroup:'',count:0})
                                        }
                                    };

                                    for (var i = 0; i < paxClasses.length; i++) {
                                        var cn = paxClasses[i].name;
                                        var exists = false;
                                        for (var a = 0; a < classRunGroups.length; a++) {
                                            if (classRunGroups[a].paxClass == cn){
                                                exists = true;
                                                break;
                                            }
                                        };
                                        if (!exists){
                                            classRunGroups.push({baseClass:'', paxClass:cn, runGroup:'',count:0})
                                        }
                                    };
                                    
                                }
                                
                                for (var i = 0; i < parts.length; i++) {
                                    var cls = parts[i].axClass;
                                    for (var a = 0; a < classRunGroups.length; a++) {
                                        var crg = classRunGroups[a];
                                        if ((cls.paxClass && crg.paxClass == cls.paxClass)
                                            || cls.name == crg.baseClass)
                                            classRunGroups[a].count = classRunGroups[a].count ? classRunGroups[a].count+1 : 1;
                                    };
                                };

                                classRunGroups.sort(function(a,b){
                                    if (a.paxClass == b.paxClass){
                                        return a.baseClass > b.baseClass ? 1 : -1;
                                    }
                                    else return a.paxClass > b.paxClass ? 1 : -1;
                                })

                                res.render('event/event_rungroupbyclass.jade', { title: 'Set Run Groups by Class', event: ev, season:season, classRunGroups:classRunGroups, participants:parts });
                            }
                        })
                    }
                    else {
                        res.send('Invalid event');
                    }
                })
                    
            });
       
    })

app.get('/event/reports/audit/:id', function(req,res){
    var eid = req.params.id, allow = false;
        models.events.findOne({ _id: eid }, function (ere, ev) {
            if (ere || !ev) { res.render('error.jade',{message:'Event does not exist. ' + (ere || '')}) }
            else {
                // models.participants.find({eventId: eid}, function(er, parts){
                //     models.seasons.findOne({clubId: ev.club.id}, function(er,season){
                        models.runs.find({ eventId: eid, status:'F' }).sort({ runNumber: 1 }).exec(function (er, runs) {
                            res.render('event/audit_report.jade', {
                                title: 'Audit Report'
                                , runs: runs
                                , event:ev
                                // , participants:parts
                                // , season:season
                                , session:req.session
                            });
                        });
                //     });
                // });
            }
        });
})







/************************************************************


    REGSITRATION IMPORT


************************************************************/







    app.get('/event/:id/registrationimport', authorize(['Club Admin','Event Admin']), function(req,res){
        var eid = req.params.id, allow = false;

            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    res.render('event_registrationimport.jade',{title:'Import Registration Choices', event:ev, session:req.session, message:''});
                } else {
                    res.redirect('/NoAccess.html');
                }
            }); // model.events
       
    })
    
    app.get('/event/:id/importreg', authorize(['Club Admin','Event Admin']), function(req,res){
        var eid = req.params.id, allow = false;
        //TODO auth user to event
        
            models.events.findById(eid, function (err, ev) {

                if (ev) {
                    res.render('event_registration_import_upload.jade', { title: 'Registration Import', newClasses:[], event: ev, message:'', errmsg:'', parts:[], data:[] });
                }
            });
        
    });

    app.post('/event/:id/importreg', authorize(['Club Admin','Event Admin']), function(req,res){
        var eid = req.params.id, allow = false;
        var seperator = ',';
        if (req.body.type == 'tab')
            seperator = '\t';


            var csvfile = req.files.csvfile;
            var cols = [];
            var parts = [];
            models.events.findOne({ "_id": eid }, function (err, ev) {
                var tmp_path = csvfile.path;
                fs.readFile(tmp_path, 'utf8', function (er, data) {
                    if (er) res.send(500);
                    else {
                        var regs = importer.parseCsvData(data, seperator);
                        
                        models.seasons.findOne({seasonYear:ev.season, clubId:ev.club.id}, function(er, season){
                            models.members.find({'club.id':ev.club.id}, function(er, members){
                                //TODO handle errors 
                                var valRegs = importer.validateRegistrationEntries(eid, season, members, regs, true);

                                var stats = {
                                    total:valRegs.length
                                    , fails:0
                                }
                                for (var i = 0; i < valRegs.length; i++) {
                                    if (!valRegs[i].importStatus) stats.fails++;
                                };



                                // if there are errors, show a the edit page, otherwise import it.

                                if (stats.fails > 0) {
                                    //sort entries by importstatus
                                    valRegs.sort(function(a,b){
                                        if (a.importStatus) {
                                            return 1;
                                        }
                                        else 
                                            return -1;
                                    })
                                    
                                    res.render('event/event_registration_import_confirm', {
                                        title:'Confirm Registration Data Import'
                                        , data: valRegs
                                        , event:ev
                                        , stats:stats
                                    });
                                }
                                else {
                                    // import it.

                                    res.send('import it');
                                }
                                

                            })
                        })


                        
                    }
                });
            });
       

    })

    // direct import from msr
    app.get('/event/:id/importmsr', authorize(['Club Admin','Event Admin']),function(req,res){
        var eid = req.params.id, allow = false;

            models.events.findOne({ "_id": eid }, function (err, ev) {
                if (ev) {
                    models.clubs.findById(ev.club.id, function(er, club){
                        if (!club) {
                            res.redirect('/NoAccess.html');
                        } else {
                            res.render('event_importmsr.jade',{title:'Import Registration from MotorsportReg.com'
                                , event:ev, session:req.session, message:'', club:club});
                        }
                    })
                } else {
                    res.redirect('/NoAccess.html');
                }
            }); // model.events
        

    });

    // for csv and tsv files
    app.get('/event/registrationimport/:id', authorize(['Club Admin','Event Admin']), function (req, res) {
        var eid = req.params.id, allow = false;
        //TODO auth user to event
        
            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    res.render('csvimport.jade', { title: 'Registration Import', newClasses:[], event: ev, message:'', errmsg:'', parts:[], data:[] });
                }
            });
        
    });
    function parseCSVLine(s, sep) {
        // http://stackoverflow.com/questions/1155678/javascript-string-newline-character
        var universalNewline = /\r\n|\r|\n/g;
        var a = s.split(universalNewline);
        for (var i in a) {
            for (var f = a[i].split(sep = sep || ","), x = f.length - 1, tl; x >= 0; x--) {
                if (f[x].replace(/"\s+$/, '"').charAt(f[x].length - 1) == '"') {
                    if ((tl = f[x].replace(/^\s+"/, '"')).length > 1 && tl.charAt(0) == '"') {
                        f[x] = f[x].replace(/^\s*"|"\s*$/g, '').replace(/""/g, '"');
                    } else if (x) {
                        f.splice(x - 1, 2, [f[x - 1], f[x]].join(sep));
                    } else f = f.shift().split(sep).concat(f);
                } else f[x].replace(/""/g, '"');
            } a[i] = f;
        }
        return a;
    }



    app.post('/event/registrationimport/:id', authorize(['Club Admin','Event Admin']), function (req, res) {
        var eid = req.params.id, allow = false;
        var seperator = ',';
        if (req.body.type == 'tab')
            seperator = '\t';

       

            var csvfile = req.files.csvfile;
            var cols = [];
            var parts = [];
            models.events.findOne({ "_id": eid }, function (err, ev) {
                var tmp_path = csvfile.path;
                fs.readFile(tmp_path, 'utf8', function (er, data) {
                    var lines = data.split(UNIVERSAL_NEWLINE);
                    var output = [];
                    if (lines.length > 1) {
                        cols = parseCSVLine(lines[0],seperator)[0];
                        var count = 0;
                        var usePaxedClass = false;
                        for (var i = 1; i < lines.length; i++) {
                            var p = { axclass: '', paxclass:'', carnumber: '', clubMemberId:'', first: '', last:'', paid: false, car: {year:0, description:'',make:'',model:'', color:''}};
                            var items = parseCSVLine(lines[i],seperator)[0];
                            //output.push('<tr>');
                            if (items.length > 7){
                                count++;
                                for (var a = 0; a < items.length; a++) {
                                    if (cols[a] !== undefined) {
                                        //TODO change col header to lowercase and eval
                                        switch (cols[a].trim()) {
                                            case 'First Name':
                                                p.first = items[a]; break;
                                            case 'Last Name':
                                                p.last = items[a]; break;
                                            case 'Number':
                                                p.carnumber = items[a]; break;
                                            case 'No.':
                                                p.carnumber = items[a]; break;
                                            case 'ClassPaxed':
                                                usePaxedClass = true;
                                                p.axclass = items[a];break;
                                            case 'Class':
                                                p.axclass = items[a]; break;
                                            case 'Paid':
                                                p.paid = items[a] == 'Yes'; break;
                                            case 'Car Color':
                                                p.car.color = items[a]; break;
                                            case 'Color':
                                                p.car.color = items[a]; break;
                                            case 'Year':
                                                p.car.year = parseInt(items[a]); break;
                                            case 'Make':
                                                p.car.make = items[a]; break;
                                            case 'Model':
                                                p.car.model = items[a];break;
                                                
                                            case 'Member #':
                                                p.clubMemberId = items[a];break;
                                            case 'Car Model':
                                                p.car.year = parseInt(items[a].trim().substring(0, 4));
                                                p.car.year = p.car.year > 1900 ? p.car.year : 0;
                                                var card = '';
                                                if (p.car.year > 0)
                                                    card = items[a].substring(4).trim();
                                                else
                                                    card = p.car.description = items[a];
                                                
                                                p.car.description = card;
                                                var carda = card.trim().split(' ');
                                                p.car.make = carda[0];
                                                carda.shift();
                                                if (carda.length > 0)
                                                    p.car.model = carda.join(' ');
                                                break;

                                        }
                                    }
                                    
                                }
                                //do car description
                                p.car.description = (p.car.year > 0 ? p.car.year.toString() + ' ' : '')
                                    + p.car.make + ' ' + p.car.model;
                                if ((p.first.length > 0 || p.last.length > 0) && p.axclass.length > 0 && p.carnumber.length > 0)
                                    output.push(p);
                            }
                            //console.log(p);
                            //output.push('</tr>');
                        }
                        //output.push('</table>');

                        // convert to registrationEntry, could do this above
                        var regList = []
                            , parseAxClassForPax = !usePaxedClass;
                        //TODO get rid of this step, was in a hurry
                        for (var i=0;i<output.length;i++){
                            var rege = new importer.registrationEntry()
                                , ot = output[i];
                            rege.firstName = ot.first;
                            rege.lastName = ot.last;
                            if (usePaxedClass) {
                                if (ot.axclass.indexOf('-') > -1){
                                    var scls = ot.axclass.split('-');
                                    rege.axClass = scls[1];
                                    rege.paxClass = scls[0];
                                }
                                else 
                                    rege.axClass = ot.axclass;
                            } else {
                                rege.axClass = ot.axclass;
                            }
                            rege.car = ot.car;
                            rege.clubMemberId = ot.clubMemberId;
                            rege.paid = ot.paid;
                            rege.carNumber = ot.carnumber;
                            regList.push(rege);
                        }

                        importer.events.importRegistration(ev, regList, {parseAxClassForPax:parseAxClassForPax}, function(errors, participants){
                            var errmsg = '', msg = 'Successfully imported participants!';
                            if (errors.length > 0){
                                errmsg = errors.join(', ');
                                msg = 'Errors occurred during the import.';
                            }
                            res.render('csvimport.jade', { title: 'Registration Import', event: ev, parts:participants
                                , message:msg, errmsg:errmsg, newClasses:[], data: { items: [], count: 0} });
                        })

                    }
                    else {
                        output.push({name:'Invalid'});
                    }
                    //res.render('csvimport.jade', { title: 'Registration Import', event: ev, data: { items: output, count: count } });
                });

            });

        

    });

    app.get('/event/drivercheckin/:id', authorize(['Club Admin','Event Admin','Registrar']), function (req, res) {
        var eid = req.params.id, allow = false;
        //TODO authorize user

            models.events.findOne({ "_id": eid }, function (ere, ev) {
                if (ev) {
                    models.participants.find({ eventId: eid }).sort({ 'driver.name': 1 }).exec(function (err, parts) {
                        //models.clubClasses.find({ 'club.name': ev.club.name }).sort({ name: 1 }).exec(function (ercc, cls) {
                        models.seasons.find({ clubId: ev.club.id, seasonYear: ev.season }, function (er1, seasons) {
                            if (seasons.length == 1) {
                                parts.sort(function(a,b){
                                    if (a.checkedIn == b.checkedIn)
                                        return a.driver.name > b.driver.name ? 1 : -1;
                                    else 
                                        return a.checkedIn ? 1 : -1;
                                })
                                res.render('drivercheckin.jade', {
                                    event: ev, title: 'Driver Check-in', session: req.session
                                    , participants: parts
                                    , classes: seasons[0].classes
                                    , paxClasses: seasons[0].paxClasses
                                    , defaultRunGroup: ev.runGroups[0].name
                                });
                            } else {
                                res.send('season not configured.');
                            }
                        });
                    });
                } else {
                    res.redirect('/NoAccess.html');
                }
            });
        
        
    });

    app.get('/test', function (req, res) {
        res.render('test.jade', { title: 'test' });
    });

    app.get('/event/:id/postresults', authorize(['Club Admin','Event Admin']), function(req,res){
        var eid = req.params.id
            , allow = false;

            models.events.findOne({ _id: eid }, function (er, ev) {
                if (ev) {
        
                        res.render('event_postresults.jade', {title:'Post Event Results',event:ev});
                        
                } else {
                    res.send('Invalid request.');
                }
            });
        
    })


    app.get('/event/leaderboard/:id', function (req, res) {
        var eid = req.params.id;

        models.events.findOne({ _id: eid }, function (er, ev) {
            if (ev) {
                models.seasons.findOne({clubId: ev.club.id, seasonYear:ev.season}, function(er, season){
                    models.events.find({'club.id':ev.club.id, season:ev.season, countForPoints:true},'_id, date').sort({date:1}).exec(function(er1, events) {
                        var paxlb = ev.paxLeaderBoard
                            , classlb = ev.classLeaderBoard;

                        res.render('event_leaderboard.jade', {title:'Event Leaderboard',event:ev
                            , events:events, pax:paxlb, cls:classlb, session:req.session, season:season});
                        

                    });
                })
            } else {
                res.send('Invalid request.');
            }
        });
    });


    app.get('/event/leaderboard/:id/export/:board/:type', function (req, res) {
        var eid = req.params.id
            , exportType = req.params.type || 'html'
            , board = req.params.board || 'class';

        models.events.findOne({ _id: eid }, function (er, ev) {
            if (ev) {
                models.seasons.findOne({clubId: ev.club.id, seasonYear:ev.season}, function(er, season){
                    
                    var types = ['csv','tsv','html']
                        , delimiter = ','
                        ;

                    if (types.indexOf(exportType) == -1){
                        res.send('Invalid export type');
                    }
                    else if (['class','pax'].indexOf(board) == -1){
                        res.send('Invalid leaderboard');
                    }
                    else {
                        if (exportType == 'tsv'){
                            exportType = 'csv';
                            delimiter = '\t';
                        }
                        var cfg = {
                            event:ev 
                            , season: season 
                            , type:exportType
                            , board:board
                            , delimiter:delimiter
                        }
                        var output = exporter.exportEventLeaderboard(cfg);

                        if (exportType == 'csv'){
                            res.setHeader('Content-disposition', 'attachment; filename='+board+'-leaderboard.' + req.params.type);
                        }
                        res.send(output);
                            
                    }
                });
            } else {
                res.send('Invalid request.');
            }
        });
    });

    app.get('/event/results/:id', function (req, res) {
        res.sendfile('./public/Results.html');
    });

    app.get('/event/liveresults/:id', function (req, res) {
        //res.sendfile('./public/Results.html');
        var eid = req.params.id, allow = false;
        //console.log('session.auth: ' + JSON.stringify(req.session.auth));
        //TODO figure out the below.  it is always setting guest even if logged in
        //if (!req.session.auth || !req.session.auth.eventid) {
        //    setGuestSession(req, eid);
        //}
        models.events.findOne({ "_id": eid }, function (err, ev) {
            res.render('liveresults.jade', { title: 'Live Results', event:ev, session:req.session });
        });
    });

    app.get('/event/announcer/:id', function (req, res) {
        //res.sendfile('./public/Results.html');
        var eid = req.params.id, allow = false;
        models.events.findOne({ "_id": eid }, function (err, ev) {
            res.render('announcer.jade', { title: 'Announcer Screen', event: ev, session:req.session });
        });
    });
    app.get('/event/queue/:id', authorize(['Club Admin','Event Admin','Time Keeper']), function (req, res) {

        //res.sendfile('./public/Queue.html');
        var eid = req.params.id, allow = false;

            models.events.findOne({ "_id": eid }, function (err, ev) {
            
                if (ev) {
                    models.participants.find({ eventId: eid }).sort({'driver.name':1}).exec(function(err, parts){
                        console.log('hardwareButtonsEnabled: ' + hardwareButtonsEnabled)
                        res.render('timekeeper.jade', {
                            event: ev, title: ev.name + ' Queue', session: req.session
                            , participants:parts
                            , hardwareButtonsEnabled: hardwareButtonsEnabled
                        });
                    });
                } else {
                    res.redirect('/NoAccess.html');
                }
            });
        
    });
    
    app.get('/event/conecounter/:id', authorize(['Club Admin','Event Admin','Time Keeper','Cone Counter']), function (req, res) {
        var eid = req.params.id, allow = false;
        
            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    var courseStations = [];
                    for (var i = 0; i < ev.stations.length; i++) {
                        if (ev.stations[i].name.indexOf('Course #') > -1) {
                            courseStations.push(ev.stations[i].name.replace('Course #',''));
                        }
                    }
                    //models.participants.find({ eventId: eid }, function (err, parts) {
                        res.render('conecounter2.jade', {
                            event: ev, title: 'Cone Counter', session: req.session, courseStations: courseStations
                        });
                    //});
                } else {
                    res.redirect('/NoAccess.html');
                }
            });
        
    });
    app.get('/event/conecounter-old/:id', authorize(['Club Admin','Event Admin','Time Keeper','Cone Counter']), function (req, res) {

        //res.sendfile('./public/Queue.html');
        var eid = req.params.id, allow = false;
        //TODO auth the user to event
       
            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    var courseStations = [];
                    for (var i = 0; i < ev.stations.length; i++) {
                        if (ev.stations[i].name.indexOf('Course #') > -1) {
                            courseStations.push(ev.stations[i].name.replace('Course #',''));
                        }
                    }
                    //models.participants.find({ eventId: eid }, function (err, parts) {
                        res.render('conecounter.jade', {
                            event: ev, title: 'Cone Counter', session: req.session, courseStations: courseStations
                        });
                    //});
                } else {
                    res.redirect('/NoAccess.html');
                }
            });
        
    });


    app.get('/event/carqueuer1/:id', authorize(['Club Admin','Event Admin','Time Keeper','Car Queuer']), function (req, res) {

        //res.sendfile('./public/Queue.html');
        var eid = req.params.id, allow = false;
        //TODO auth the user to event

            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    models.participants.find({ eventId: eid }, function (err, parts) {
                        res.render('carqueuer.jade', {
                            event: ev, title: ev.name + ' Car Queue', session: req.session
                            , participants: parts
                        });
                    });
                } else {
                    res.redirect('/NoAccess.html');
                }
            });
       
    });

    app.get('/event/carqueuer2/:id', authorize(['Club Admin','Event Admin','Time Keeper','Car Queuer']), function (req, res) {

        //res.sendfile('./public/Queue.html');
        var eid = req.params.id, allow = false;
        //TODO auth the user to event

            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    models.participants.find({ eventId: eid }, function (err, parts) {
                        res.render('carqueuer2.jade', {
                            event: ev, title: ev.name + ' Car Queue', session: req.session
                            , participants: parts
                        });
                    });
                } else {
                    res.redirect('/NoAccess.html');
                }
            });
        
    });
    
    app.get('/event/carqueuer/:id', authorize(['Club Admin','Event Admin','Time Keeper','Car Queuer']), function (req, res) {

        //res.sendfile('./public/Queue.html');
        var eid = req.params.id, allow = false;
        //TODO auth the user to event

            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    models.participants.find({ eventId: eid }, function (err, parts) {
                        res.render('carqueuer3.jade', {
                            event: ev, title: ev.name + ' Car Queue', session: req.session
                            , participants: parts
                        });
                    });
                } else {
                    res.redirect('/NoAccess.html');
                }
            });
        
    });

    app.get('/event/workercheckin/:id', authorize(['Club Admin','Event Admin','Time Keeper','Worker Checkin','Registrar']), function (req, res) {
        //TODO authorization user
        var eid = req.params.id, allow = false;
        
            models.events.findOne({ "_id": eid }).select('_id id club workerRoles runGroups name date sessions stations').exec(function (err, ev) {
                if (ev) {
                    models.participants.find({ eventId: eid }).sort({'driver.name':1}).exec(function (erp, parts) {
                        if (erp) {
                            res.send('Error occurred retrieving drivers data. ERROR: ' + erp.toString());
                        }
                        else {
                            res.render('workercheckin.jade', {
                                title: 'Worker Check-in'
                                , event: ev
                                , participants: parts
                                , defaultRunGroup: ev.runGroups[0].name
                                , session:req.session
                            });
                        }
                    });
                }
            });
        

    });

    app.get('/event/techinspector/:id', authorize(['Club Admin','Event Admin','Time Keeper','Tech Inspector']), function (req, res) {
        //TODO authorization user
        var eid = req.params.id;
        
        models.events.findOne({ "_id": eid }, function (err, ev) {
            if (ev) {
                models.participants.find({ eventId: eid }).sort({'isTechd':1, 'driver.carNumber':-1}).exec( function (erp, parts) {
                    if (erp) {
                        res.send('Error occurred retrieving drivers data. ERROR: ' + erp.toString());
                    }
                    else {
                        res.render('techinspector.jade', {
                            title: 'Tech Inspector'
                            , event: ev
                            , participants: parts
                            , session:req.session
                        });
                    }
                });
            } else {
                res.redirect('/NoAccess.html');
            }
        });

    });

    app.get('/event/edit/:id', authorize(['Club Admin','Event Admin']), function (req, res) {
        //TODO authorization user
        var eid = req.params.id;
        var runGroups = models.runGroups;
        // var runGroups = [
        //     { name: 'Red', color: 'red', selected:false }
        //     , { name: 'Blue', color: 'blue', selected: false }
        //     , { name: 'Green', color: 'green', selected: false }
        //     , { name: 'Yellow', color: 'yellow', selected: false }
        //     , { name: 'Orange', color: 'orange', selected: false }
        //     , { name: 'Purple', color: 'purple', selected: false }
        //     , { name: 'Cyan', color: 'cyan', selected: false }
            
        // ];
        var roles = models.roles
            , stations = [];
        
        models.events.findOne({ "_id": eid }, function (err, ev) {
            if (ev) {
                var isLive = date1(new Date()) == date1(ev.date);
                var dt = date2(ev.date);

                for (var i = 0; i < runGroups.length; i++) {
                    for (var b = 0; b < ev.runGroups.length; b++) {
                        if (ev.runGroups[b].name == runGroups[i].name) {
                            runGroups[i].selected = true;
                            runGroups[i].label = ev.runGroups[b].label
                            break;
                        }
                    }
                }
                for (var r = 0; r < roles.length; r++) {
                    roles[r].selected = false;
                    roles[r].password = '';
                    for (var c = 0; c < ev.workerRoles.length; c++) {
                        if (ev.workerRoles[c].role == roles[r].name) {
                            roles[r].selected = true;
                            roles[r].password = ev.workerRoles[c].password;
                            break;
                        }
                    }
                }
                for (var r = 0; r < models.stations.length; r++) {
                    stations[r] = { name: models.stations[r], selected: false };

                    for (var c = 0; c < ev.stations.length; c++) {
                        if (ev.stations[c].name == models.stations[r]) {
                            stations[r].selected = true;
                            break;
                        }
                    }
                }

                res.render('editevent.jade', {
                    event: ev, title: ev.name
                    , roles: models.roles, isLive: isLive
                    , runGroups: runGroups
                    , roles: roles
                    , stations:stations
                    , session:req.session
                    , date:dt
                });
            } else {
                res.redirect('/NoAccess.html');
            }
        });
    });

    app.get('/event/:id', function (req, res) {
        //res.sendfile('./public/Event.html');
        //TODO authorize user to event
        var eid = req.params.id;

        models.events.findOne({ "_id": eid }).select('_id name club location date countForPoints session runGroups participantCount totalRuns rmLiveUrl currentRunGroup courseMap ').exec(function (err, ev) {
            if (ev) {
                var isLive = date1(new Date()) == date1(ev.date);
                
                res.render('event_home.jade', {
                    event: ev, title: ev.name, session: req.session
                    , roles:models.roles, isLive: isLive
                            , settings:settings
                });
            } else {
                res.redirect('/NoAccess.html');
            }
        });

    });



    app.get('/club/:clubname/leaderboard/recalc/:year?', function (req, res) {

        var year = req.params.year
            , clubname = req.params.clubname
            ;
            if (!year){
                year = new Date().getFullYear();
            }
            models.clubs.findOne({name:clubname},function(er, club){
                if (club == null) res.send('Club not found.');
                else {
                    leaderboard.calcSeason(year, function(er){
                        res.redirect('/club/' + club.name + '/leaderboard');
                    })
                    // leaderboard.calcSeason(models, club, year, function(er){
                    //     //res.render('club_leaderboardrecalc.jade', {title:'Recalc Leaderboard', club:club, paxparts: data.paxParts, clsparts: data.classParts });
                    //     res.redirect('/club/' + club.name + '/leaderboard');

                    // })
                    // recalcLeaderboardYear(club, year, function(er, data){
                    //     res.render('club_leaderboardrecalc.jade', {title:'Recalc Leaderboard', club:club, paxparts: data.paxParts, clsparts: data.classParts });
                    // })
                }
            })
            

    });
    

    app.get('/participant/:pid', function(req,res){
        var pid = req.params.pid;
        
        models.participants.findById(pid, function(er, part){
            if (er) res.send('Error occurred. ' + er);
            else {
                if (part == null){
                    res.send('Participant not found.');
                } else {
                    models.events.findById(part.eventId, function(er,ev){
                        if (er) res.send('Error finding event.' + er);
                        else {
                            models.runs.find({participantId:pid, status:'F'}).sort({runNumber:1}).exec(function(er,runs){
                                if (er) res.send('Error occurred. ' + er);
                                else {
                                    var rankClass='-'
                                        , rankOverall='-'
                                        , rankPax='-'
                                        , th = ''
                                        ;
                                    if (part.rankOverall > 0) {
                                        var s = part.rankOverall.toString().split("").reverse().join("").substring(0,1);
                                        
                                        switch (parseInt(s)){
                                            case 1: th='st';break;
                                            case 2: th='nd';break;
                                            case 3: th='rd';break;
                                            default: th='th';break;
                                        }
                                        rankOverall = part.rankOverall + th;
                                    }
                                    if (part.rankClass > 0) {
                                        var s = part.rankClass.toString().split("").reverse().join("").substring(0,1);
                                        
                                        switch (parseInt(s)){
                                            case 1: th='st';break;
                                            case 2: th='nd';break;
                                            case 3: th='rd';break;
                                            default: th='th';break;
                                        }
                                        rankClass = part.rankClass + th;
                                    }
                                    if (part.rankPax > 0) {
                                        var s = part.rankPax.toString().split("").reverse().join("").substring(0,1);
                                        
                                        switch (parseInt(s)){
                                            case 1: th='st';break;
                                            case 2: th='nd';break;
                                            case 3: th='rd';break;
                                            default: th='th';break;
                                        }
                                        rankPax = part.rankPax + th;
                                    }
                                    res.render('participant', {title:part.driver.name, club:part.club, session:req.session
                                        , part:part, runs:runs, event:ev
                                        , rankOverall:rankOverall, rankClass:rankClass, rankPax:rankPax});
                                }
                            })
                        }
                    })
                }
                    
            }
        });
    })

    app.get('/club/:clubname/leaderboard', function (req, res) {
        var clubname = req.params.clubname
            , year = new Date().getFullYear();

        models.clubs.findOne({ name: clubname }, function (er, club) {
            if (club) {
                models.events.find({ 'club.id': club._id, season: year, countForPoints:true }).sort({dateInt:-1}).exec(function (er1, events) {
                    res.render('club_leaderboard.jade', {title:'Club Leaderboard', events:events
                        , club:club, season:year, session:req.session});
                });
            } else {
                res.send('Invalid Request.');
            }
        });
    });

    // function calcRun(run, origpartId, bestImproved, paxImproved, recalcPart) {
    //     var eid = run.eventId
    //         , origparts = []
    //         , origttod = null
    //         , changedparts = []
    //     ;

    //     var start = new Date().getTime(), audit = [];

    //     if (recalcPart) {
    //         models.participants.findOne({ eventId: eid, _id: origpartId }, function (erp, part) {
    //             models.runs.find({ eventId: eid, participantId: part._id }, function (err, runs) {
    //                 //reset best times, cone counts
    //                 part.totalCones = 0;
    //                 part.bestTime = 0;
    //                 part.bestPaxTime = 0;
    //                 part.totalRuns = 0;
    //                 part.totalCountedRuns = 0;
    //                 part.totalDnfs = 0;
    //                 var ttlcones = 0;
    //                 for (var rix in runs) {
    //                     var run = runs[rix];
    //                     part.totalRuns++;
    //                     if (!run.getsRerun) part.totalCountedRuns++;
    //                     part.totalCones += runs[rix].cones;
    //                     if (!run.isDnf && !run.getsRerun && !run.isOff) {
    //                         if ((part.bestTime > 0 && run.totalTime < part.bestTime) || part.bestTime == 0) {
    //                             part.bestTime = run.totalTime;
    //                         }
    //                         if ((part.bestPaxTime > 0 && run.paxTime < part.bestPaxTime) || part.bestPaxTime == 0) {
    //                             part.bestPaxTime = run.paxTime;
    //                         }
    //                     }
    //                     if (run.isDnf) part.totalDnfs++;
    //                     if (run.getsRerun) part.totalReruns++;
    //                 }
    //                 part.save(function (er1) {
    //                     //TODO send updr to update the run
    //                     //calcRun(r, part._id, true, true);
    //                     doit();
    //                 });
    //             });
    //         });
    //     } else {
    //         doit();
    //     }
    //     function doit() {
    //         models.participants.find({ eventId: eid }).sort({ _id: 1 }).exec(function (err, pts) {
    //             audit.push('parts'); audit.push(new Date().getTime() - start);
    //             if (pts.length > 0) {
    //                 for (var pp in pts) {
    //                     origparts.push({ _id: pts[pp]._id, driver: { name: pts[pp].driver.name }, rankOverall: pts[pp].rankOverall, rankClass: pts[pp].rankClass, rankPax: pts[pp].rankPax, bestTime: pts[pp].bestTime, bestPaxTime: pts[pp].bestPaxTime });
    //                 }
    //                 audit.push('opart loop'); audit.push(new Date().getTime() - start);
    //                 models.ttods.findOne({ eventId: eid }, function (errrr, ttod) {
    //                     audit.push('ttod fectch'); audit.push(new Date().getTime() - start);
    //                     if (!ttod) {
    //                         ttod = new models.ttods();
    //                         ttod.eventId = eid;
    //                     }

    //                     if (bestImproved) {
    //                         //console.log('best improved');
    //                         var bret = calcOverallRankings(pts, ttod);
    //                         pts = bret.participants;
    //                         ttod = bret.ttod;
    //                         audit.push('overall'); audit.push(new Date().getTime() - start);

    //                         var cret = calcClassRankings(pts, run.axClass.name);
    //                         pts = cret.participants;
    //                         audit.push('class'); audit.push(new Date().getTime() - start);
    //                     }

    //                     if (paxImproved) {
    //                         //console.log('pax improved');
    //                         var pret = calcPaxRankings(pts, ttod);
    //                         pts = pret.participants;
    //                         ttod = pret.ttod;
    //                         audit.push('pax'); audit.push(new Date().getTime() - start);
    //                     }


    //                     // save ttod
    //                     //TODO do diff on ttod/orig and send changes
    //                     ttod.save(function (ert) {

    //                     });

    //                     //determine parts changes
    //                     //first sort updated parts to match orig
    //                     pts.sort(function (a, b) {
    //                         var aa = a._id
    //                             , bb = b._id;
    //                         if (aa < bb) return -1;
    //                         if (aa > bb) return 1;
    //                         return 0;
    //                     });

    //                     //console.log('do changes detect');
    //                     //now loop through and compare
    //                     var changes = [];
    //                     //console.log('driver changed' + origpart._id);
    //                     for (var i = 0; i < pts.length; i++) {
    //                         var o = origparts[i];
    //                         var p = pts[i];
    //                         //console.log(o.driver.name + ' ' + p.driver.name);
    //                         //console.log(o.rankOverall + ' - ' + p.rankOverall);
    //                         if (o._id == p._id) {
    //                             if (p._id.toString() == origpartId.toString()) {

    //                                 changes.push(p);
    //                                 //TODO figure out how to make all this async
    //                                 //pts[i].save();
    //                                 p.save();
    //                             }
    //                                 //TODO should we include best/pax time
    //                             else if (o.rankOverall != p.rankOverall ||
    //                                 o.rankClass != p.rankClass ||
    //                                 o.rankPax != p.rankPax) {
    //                                 changes.push(p);
    //                                 //console.log('changed detected ' + p.driver.name);
    //                                 //TODO figure out how to make all this async or intelligent to rollback ui if failed
    //                                 pts[i].save();
    //                             }
    //                         }
    //                         else { console.log('change detect: parts order does not match'); }

    //                     }

    //                     audit.push('detect'); audit.push(new Date().getTime() - start);
    //                     io.sockets.in(eid + '-results').emit('results', { type: 'incr', participants: changes, ttods: ttod });
    //                     //console.log('done with changes');
    //                     //console.log(audit.join(', '));
    //                     var auditor = new models.audit();
    //                     auditor.date = new Date();
    //                     auditor.source = 'processtime'
    //                     auditor.eventId = eid;
    //                     var stop = new Date().getTime();
    //                     auditor.description = 'processed ' + changes.length + ' changes & ' + pts.length + ' drivers in ' + (stop - start) + ' ms. :: ' + audit.join(',');
    //                     auditor.save(function (er) { });
    //                     console.log('finished in ' + (stop - start) + ' ms');
    //                 });

    //             }
    //         });
    //     }
    // }


    function doChangeDetect(oparts, nparts) {
        /*
           oparts is the original parts array
           , nparts is the new/updated parts array
       
           return array of parts changed to send and save
       */



    }



    function calcOverallRankings(parts, ttod) {
        var rank = 0, plen = parts.length;
        //determine overall ranking
        parts.sort(function (a, b) {
            var aa = a.bestTime
                , bb = b.bestTime;
            if (aa < bb) return -1;
            if (aa > bb) return 1;
            return 0;
        });

        //BESTTIME
        //now loop through bestTime sorted and update 
        var funFound = false, ladiesFound = false
            , ttodFound = false, mensFound = false
            , prevTime = 0, bestTime = 0;

        for (var i = 0; i < plen; i++) {
            if (parts[i].bestTime > 0) {

                if (!ttodFound) {
                    ttod.ttod.time = parts[i].bestTime;
                    ttod.ttod.driver = parts[i].driver.name;
                    ttod.ttod.car = parts[i].driver.car.description;
                    ttod.ttod.carNumber = parts[i].driver.carNumber;
                    bestTime = parts[i].bestTime;
                    prevTime = parts[i].bestTime;
                    ttodFound = true;
                }
                if (!funFound && parts[i].axClass.name == 'FUN') {

                    ttod.fun.time = parts[i].bestTime;
                    ttod.fun.driver = parts[i].driver.name;
                    ttod.fun.car = parts[i].driver.car.description;
                    ttod.fun.carNumber = parts[i].driver.carNumber;
                    funFound = true;
                }
                //TODO need to change classes to hold the isLadies flag
                if (!ladiesFound && parts[i].axClass.isLadies) {
                    ttod.womens.time = parts[i].bestTime;
                    ttod.womens.driver = parts[i].driver.name;
                    ttod.womens.car = parts[i].driver.car.description;
                    ttod.womens.carNumber = parts[i].driver.carNumber;
                    ladiesFound = true;
                }
                //TODO need to change classes to hold the isLadies flag
                if (!mensFound && !parts[i].axClass.isLadies) {
                    ttod.mens.time = parts[i].bestTime;
                    ttod.mens.driver = parts[i].driver.name;
                    ttod.mens.car = parts[i].driver.car.description;
                    ttod.mens.carNumber = parts[i].driver.carNumber;
                    mensFound = true;
                }

                // do differences 
                parts[i].diffOverall = Math.floor((parts[i].bestTime - bestTime) * 1000) / 1000;
                parts[i].diffPrevOverall = Math.floor((parts[i].bestTime - prevTime) * 1000) / 1000;

                rank++;
                parts[i].rankOverall = rank;
                //set prev time to current
                prevTime = parts[i].bestTime;
            } else {
                parts[i].rankOverall = 0;
            }
        }

        return { participants: parts, ttod: ttod };
    }

    function calcPaxRankings(parts, ttod, points) {
        //determine pax ranking
        parts.sort(function (a, b) {
            var aa = a.bestPaxTime
                , bb = b.bestPaxTime;
            if (aa < bb) return -1;
            if (aa > bb) return 1;
            return 0;
        });


        //now loop through paxtime sorted and update
        var bestTime = 0;
        var prevTime = 0;
        var paxttodFound = false, plen = parts.length, paxRank = 0;

        for (var i = 0; i < plen; i++) {
            if (parts[i].axClass.name.toLowerCase().indexOf('fun') == -1 && parts[i].bestPaxTime > 0) {
                if (!paxttodFound) {

                    ttod.pax.time = parts[i].bestPaxTime;
                    ttod.pax.driver = parts[i].driver.name;
                    ttod.pax.car = parts[i].driver.car.description;
                    ttod.pax.carNumber = parts[i].driver.carNumber;
                    paxttodFound = true;

                    bestTime = parts[i].bestPaxTime;
                    prevTime = parts[i].bestPaxTime;
                }


                // do differences 
                parts[i].diffPax = Math.floor((parts[i].bestPaxTime - bestTime) * 1000) / 1000;
                parts[i].diffPrevPax = Math.floor((parts[i].bestPaxTime - prevTime) * 1000) / 1000;

                paxRank++;
                parts[i].rankPax = paxRank;
                var pt = 0;
                if (points){
                    var ppts = points[paxRank-1];
                    if (ppts !== undefined){
                         pt = ppts.points;
                        console.log('doing points: ' + pt);
                    }
                }
                
                parts[i].paxPoints = pt;
                prevTime = parts[i].bestPaxTime;
            }
            else { parts[i].rankPax = 0; }
        }
        return { participants: parts, ttod: ttod };
    }
    function calcClassRankings(parts, axclass, points) {
        // do class rankings
        parts.sort(function (a, b) {
            var aa = a.axClass.name
                , bb = b.axClass.name;
            if (aa < bb) return -1;
            if (aa > bb) return 1;
            return 0;
        });
        //now loop through and piece out the classes to sort and update
        var cls = '', clssub = [], plen = parts.length;
        for (var i = 0; i < plen; i++) {
            if (cls != parts[i].axClass.name) {
                if (clssub.length > 0) {
                    clssub.sort(function (a, b) {
                        var aa = a.bestTime
                            , bb = b.bestTime;
                        if (aa < bb) return -1;
                        if (aa > bb) return 1;
                        return 0;
                    });
                    classRank = 1;
                    var bestc = 0, bestcp = 0;
                    var first = true;
                    for (var a = 0; a < clssub.length; a++) {

                        if (first) {
                            if (clssub[a].bestTime > 0) {
                                bestc = clssub[0].bestTime;
                                bestcp = clssub[0].bestTime;
                                first = false;
                            }
                        }
                        for (var p = 0; p < plen; p++) {
                            if (clssub[a]._id == parts[p]._id) {
                                if (clssub[a].bestTime > 0) {
                                    parts[p].rankClass = classRank;
                                    var pt = 0;
                                    if (points){
                                        var ppts = points[classRank-1];
                                        if (ppts !== undefined){
                                             pt = ppts.points;
                                            console.log('doing points: ' + pt);
                                        }
                                    }
                                    parts[p].classPoints = pt;
                                    parts[p].diffClass = Math.floor((parts[p].bestTime - bestc) * 1000) / 1000;
                                    parts[p].diffPrevClass = Math.floor((parts[p].bestTime - bestcp) * 1000) / 1000;
                                    bestcp = parts[p].bestTime;

                                    classRank++;
                                }
                                else {
                                    parts[p].rankClass = 0;
                                }
                                break;
                            }
                        }

                    }
                    clssub = [];
                }
                cls = parts[i].axClass.name;

            }
            clssub.push(parts[i]);
        }

        //do it one last time for the remaining sub classes found
        if (clssub.length > 0) {
            clssub.sort(function (a, b) {
                var aa = a.bestTime
                    , bb = b.bestTime;
                if (aa < bb) return -1;
                if (aa > bb) return 1;
                return 0;
            });
            classRank = 1;
            var bestc = 0, bestcp = 0;
            var first = true;
            for (var a = 0; a < clssub.length; a++) {
                if (clssub[a].bestTime > 0) {
                    if (first) {
                        bestc = clssub[0].bestTime;
                        bestcp = clssub[0].bestTime;
                        first = false;
                    }
                    for (var p = 0; p < plen; p++) {
                        if (clssub[a]._id == parts[p]._id) {
                            parts[p].rankClass = classRank;
                            parts[p].diffClass = Math.floor((parts[p].bestTime - bestc) * 1000) / 1000;
                            parts[p].diffPrevClass = Math.floor((parts[p].bestTime - bestcp) * 1000) / 1000;
                            bestcp = parts[p].bestTime;
                            break;
                        }
                    }
                    classRank++;
                }
            }
        }

        return { participants: parts };
    }


};




function date1(dt, f) {
    var d = new Date(dt);
    var m_names = new Array("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December");
    var curr_date = d.getDate();
    var curr_month = d.getMonth();
    if (curr_date < 10) { curr_date = '0' + curr_date; }
    var curr_year = d.getFullYear();
    if (f) {
        return m_names[curr_month] + ' ' + curr_date + ', ' + curr_year;
    } else {
        return (curr_month+1) + '/' + curr_date + '/' + curr_year;
    }
}

function date2(dt) {
    var d = new Date(dt);
    
    var curr_date = d.getDate();
    if (curr_date < 10) {curr_date = '0'+curr_date;}
    var curr_month = d.getMonth() + 1;
    if (curr_month < 10) curr_month = '0' + curr_month;
    var curr_year = d.getFullYear();
    
    return curr_year + '-' + (curr_month) + '-' + curr_date;
    
}