require('../color');
//var msr = require('../lib/msr.js');
var utils = require('../utils')
    , engine
    , io
    , fs = require('fs')
    , importer = null
    , pjson = require('../package.json')
    , version = pjson.version
    , request = require('request')
    , settings, hardware = {emit:function(){}};

//TODO add settings passthrough from server.js so to update hardware config, etc.



function authorize(allowed){
    //allowed = array of roles allowed
    
    return function(req,res,next){
    
        if (!allowed){
            return next();
        }
        else if (!req.user || allowed.indexOf(req.user.role) == -1){
            res.status(401).send({success:false, message:'Not authorized'});
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
//         res.status(401).send({success:false, message:'Not authorized'})
//     }
// }


// function ensureAdminTk(req,res,next){
//     if (req.session.auth && (req.session.auth.role == 'Club Admin' || req.session.auth.role == 'Time Keeper')){
//         return next();
//     }
//     else {
//         res.status(401).send({success:false, message:'Not authorized'})
//     }
// }

module.exports = function (app, models, _io, _settings, _hw) {
    
    io = _io;
    engine = require('../lib/engine.js')({models:models, io:io});
    importer = require('../lib/importer.js')({models:models});
    settings = _settings;
    //if (_hw)
    hardware = _hw;
    var backupRestore = require('../lib/backupRestore')({models:models, version:version});
    // CLASSES

    

function saveSettingsToDisk(callback){
    var path = global.appRoot + '/settings.js';
    fs.writeFile(path, 'module.exports=' + JSON.stringify(settings, null, 4), function(er){
        callback(er);
    })
}


/***************************************************************


    HARDWARE INTEGRATION


***************************************************************/



    app.get('/api/hardware/restart', authorize(['Club Admin','Event Admin', 'Time Keeper']), function(req, res){
        engine.timerReset();
        hardware.restart(function(er){

            res.send({success:true, message:er});
        });
    });

    app.get('/api/hardware/start', authorize(['Club Admin','Event Admin', 'Time Keeper']), function(req,res){
        hw.start();
        res.send({success:true, status:status});
    });


    app.get('/api/hardware', authorize(['Club Admin','Event Admin', 'Time Keeper']), function(req,res){
        var status = hardware.getStatus();
        
        hardware.getPorts(function(er, ports){
            res.send({success:true, status:status, ports:ports});
        })
        
    })

    app.post('/api/hardware', authorize(['Club Admin','Event Admin', 'Time Keeper']), function(req, res){

        var interfaceType = req.body.interfaceType;
        var comPort = req.body.comPort;
        var restart = req.body.restart == 'true';
        var enabled = req.body.enabled == 'true';
//TODO validate, check if comport exits, etc.
        settings.hardware.comPort = comPort;
        settings.hardware.interfaceType = interfaceType;
        settings.hardware.enabled = enabled;

        saveSettingsToDisk(function(er){
            if (er){
                res.send({success:false, message:'Error saving settings to disk. ' + er});
            } else {
                if (restart){
                    hardware.restart(function(er){
                        console.log('hw.restart: ' + er);
                        res.send({success:!er, message: er ? er.toString() : ''});
                    });
                }
                else {
                    res.send({success:true});
                }
            }     
        });
    });




//     app.post('/api/:clubname/settings', authorize(['Club Admin']), function(req,res){

//         var clubname = req.params.clubname, allow = false, message=null;
// //TODO save settings to disk
        
//             var interfaceType = req.body.interfaceType;

//             settings.hardware.interfaceType = models.interfaceTypes[interfaceType];
//             res.send({success:true})
        
    
//     })

    app.get('/api/checkLatestVersion', function(req,res){
        models.clubs.find({}, function(er, clubs){
            var names = [];
            for (var i = 0; i < clubs.length; i++) {
                names.push(clubs[i].name);
            };
            var club;
            if (clubs.length == 1){
                club = clubs[0];
            }
            utils.checkLastestVersion(names.join('||'), function(result){
                if (club){
                    club.lastVersionCheck = new Date().getTime();
                    club.save();
                }
                    
                //console.log(result)
                result.current = version;
                result.upgrade = false;
                if (result.success){
                    if (version != result.latest)
                        result.upgrade = true;
                }
                res.send(result)
            })

        })
        
    })

    app.get('/api/upgrade/builds', authorize(['Club Admin']), function(req,res){
        var upgrade = require('../lib/upgrade')(settings, models, io);
        upgrade.getBuilds(function(er, builds){
            if (er) {
                res.send({success:false, message: er});
            }
            else {
                res.send({success:true, builds:builds})
            }
        })
    })

    app.post('/api/upgrade/:buildId', authorize(['Club Admin']), function(req,res){
        var buildId = req.params.buildId;
        var upgrade = require('../lib/upgrade')(settings, models, io);
        
        upgrade.doit(buildId, function(er){
            res.send({success:!er, message:er || 'ok'})
        })

        
    })


    /*****************************************************************

    
        BACKUP RESTORE


    *****************************************************************/





    app.get('/api/:clubname/backup/cloud/:cloudKey', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname
            , cloudKey = req.params.cloudKey;

        backupRestore.backup.getCloudBackups(cloudKey, function(er,files){
            console.log('api returned from cloud file list: ');
            console.log(files);
            if (er){
                res.send({error:true, message:er});
            } else {
                res.send({success:true, files:files});
            }
        })

    });

    app.post('/api/:clubname/restore', authorize(['Club Admin']), function(req,res){
        var restoreFrom = req.body.restoreFrom || 'local';
        var filename = req.body.filename;
        var cloudKey = req.body.cloudKey;

        var result = {success:false, message:'Invalid'};

        if (['local','cloud'].indexOf(restoreFrom) > -1 && filename){
            if (restoreFrom === 'local'){
                console.log('attempting local restore');
                backupRestore.restore.local(filename, function(er){
                    result.success = !er;
                    result.message = er || 'All good.';
                    res.send(result);
                })
            }
            else {
                console.log('attempting cloud restore');
                backupRestore.restore.cloud(cloudKey, filename, function(er){
                    result.success = !er;
                    result.message = er || 'All good.';
                    res.send(result);
                })
                
            }
        } else {
            result.message = 'Invalid or missing paramters';
            res.send(result);
        }
    })



    /****************************************************************

    
    HARDWARE


    ****************************************************************/






    app.get('/api/hardware/batterylevels', function(req,res){
        //TODO make this error proof
        if (hardware)
            res.send(hardware.getBatteryStatus());
        else
            res.send({success:false, message:'Hardware does not support battery status.'})
    })

    app.post('/api/hardware/resetstart', authorize(['Club Admin']), function(req,res){
        if (hardware && settings.hardware.interfaceType.toLowerCase() == 'tlinkdirect') {
            hardware.resetStart();
            res.send({success:true, message:''})
        }
        else
            res.send({success:false, message:'Your timing hardware does not support this feature.'})
    })

    app.post('/api/hardware/resetfinish', authorize(['Club Admin']), function(req,res){
       if (hardware && settings.hardware.interfaceType.toLowerCase() == 'tlinkdirect') {
            hardware.resetFinish();
            res.send({success:true, message:''})
        }
        else
            res.send({success:false, message:'Your timing hardware does not support this feature.'})
    })


    app.post('/api/hardware/resetfull', authorize(['Club Admin']), function(req,res){
        if (hardware && settings.hardware.interfaceType.toLowerCase() == 'tlinkdirect') {
            hardware.reset();
            res.send({success:true, message:''})
        }
        else
            res.send({success:false, message:'Your timing hardware does not support this feature.'})
    })








    //DRIVERS DATA
    app.get('/api/drivers/:clubname', function (req, res) {
        var clubname = decodeURIComponent(req.params.clubname);
        models.participants.find({ 'club.name': clubname }).distinct('driver', function (err, drivers) {
            res.send({ status: 'success', items: drivers });
        });
        //models.participants.find({ 'club.name': clubname }, 'driver car',{group:'driver'},function (err, drivers) {
        //    res.send({ status: 'success', items: drivers });
        //});
    });

    //MEMBERS DATA
    app.get('/api/:clubname/members', function (req, res) {
        //var clubname = decodeURIComponent(req.params.clubname);
        var clubname = req.params.clubname;
        models.members.find({ 'club.name': clubname })
            .select('id firstName lastName lastAxClass dedicatedNumber clubMemberId cars currentEmail lastPaxClass').sort({'lastName':1}).exec(function (err, members) {
            res.send({ status: 'success', items: members });
        });
    });

    app.post('/api/member/:id',authorize(['Club Admin']), function(req,res){
        var memberId = req.params.id;
        console.log('updating member')
        
                var updateType = req.body.updateType
                    , isEdit = req.body.isEdit == 'true';
                console.log('finding member')
                models.members.findById(memberId, function(er, m){
                    if (er) conosle.log('Error retrieving member during update. ' + er);
                    else {
                        if (m != null){
                            if (updateType == 'addr'){
                                console.log('updating address');
                                if (!isEdit){
                                    console.log('adding address...');
                                    m.addresses.push({addrType: req.body.addrType, street:req.body.street, street2:'', city:req.body.city, state:req.body.state, zip:req.body.zip});
                                }
                            }
                            else if (updateType == 'deladdr'){
                                var aid = req.body.id;
                                for (var i = 0; i < m.addresses.length; i++) {
                                    if (m.addresses[i]._id.toString() == aid){
                                        console.log('address found, removing');
                                        m.addresses[i].remove(function(er){
                                            console.log('removed');
                                        });
                                        break;
                                    }
                                };
                            }
                            else if (updateType == 'phone'){
                                var t = req.body.type 
                                    , p = req.body.phone;
                                m.phones.push({phoneType:t, number:p});
                            }
                            else if (updateType == 'delphone'){
                                var aid = req.body.id;
                                for (var i = 0; i < m.phones.length; i++) {
                                    if (m.phones[i]._id.toString() == aid){
                                        console.log('phone found, removing');
                                        m.phones[i].remove(function(er){
                                            console.log('removed');
                                        });
                                        break;
                                    }
                                };
                            }
                            else if (updateType == 'email'){
                                var email = req.body.email;
                                m.emails.push({address:email});
                            }
                            else if (updateType == 'delemail'){
                                var aid = req.body.id;
                                for (var i = 0; i < m.emails.length; i++) {
                                    if (m.emails[i]._id.toString() == aid){
                                        console.log('email found, removing');
                                        m.emails[i].remove(function(er){
                                            console.log('removed');
                                        });
                                        break;
                                    }
                                };
                            }

                            else if (updateType == 'sponsor'){
                                console.log('add sponsor');
                                var sponsor = req.body.sponsor;
                                m.sponsors.push({name:sponsor});
                            }
                            else if (updateType == 'delsponsor'){
                                var aid = req.body.id;
                                for (var i = 0; i < m.sponsors.length; i++) {
                                    if (m.sponsors[i]._id.toString() == aid){
                                        console.log('sponsor found, removing');
                                        m.sponsors[i].remove(function(er){
                                            console.log('removed');
                                        });
                                        break;
                                    }
                                };
                            }
                            else if (updateType == 'car'){
                                console.log('add car');
                                var car = {make:req.body.make, model:req.body.model, color:req.body.color, year:req.body.year
                                    , description: req.body.color + ' ' + req.body.year + ' ' + req.body.make + ' ' + req.body.model};
                        
                                m.cars.push(car);
                            }
                            else if (updateType == 'delcar'){
                                var aid = req.body.id;
                                for (var i = 0; i < m.cars.length; i++) {
                                    if (m.cars[i]._id.toString() == aid){
                                        console.log('car found, removing');
                                        m.cars[i].remove(function(er){
                                            console.log('removed');
                                        });
                                        break;
                                    }
                                };
                            }
                            else {
                                //TODO alert to fail
                            }


                            console.log('saving member')
                            m.save(function(er){
                                res.send({success:!er, message:!er ? '' : er, data:m});
                            })
                        }
                        else res.send({success:false, message:'Member not found.'})
                    }
                });
           
 
    })

    app.post('/api/membermerge', authorize(['Club Admin']), function(req,res){
        
            var masterId = req.body.masterId
                , idsToReplace = req.body.idsToReplace;

            //TODO club lookup? for multi club install
            models.members.findById(masterId, function(er, member){
                
                function doit(){
                    var id = idsToReplace.shift();
                    if (id !== undefined){
                        // update all part records
                        models.participants.update({memberId:id},
                            {
                                $set:{
                                    'driver.name': member.firstName + ' ' + member.lastName 
                                    , 'driver.firstName': member.firstName 
                                    , 'driver.lastName': member.lastName 
                                    , 'driver.clubMemberId': member.clubMemberId
                                    , memberId: masterId
                                }
                            }
                            , {multi:true}
                            , function(er){
                                if (!er){

                                    models.runs.update({memberId: id}, {
                                        $set:{
                                            'driver.name': member.firstName + ' ' + member.lastName 
                                            , memberId: masterId
                                        }
                                    }
                                    , {multi:true}
                                    , function(er){
                                        if (!er){
                                            models.members.remove({_id: id}, function(er){
                                                console.log('member removed: ' + er);
                                                doit();
                                            });
                                        }
                                        else {
                                            //TODO better error handling
                                            doit();
                                        }
                                    })
                                    
                                }
                                else {
                                    //TODO handle error
                                    doit();
                                }
                            });
                        // update all runs
                    }
                    else {
                        res.send({success:true});
                    }
                }

                if (er || member == null){
                    res.send(500);
                }
                else {
                    doit();
                }
            })
            

    })

    //MEMBERS DATA
    app.get('/api/:clubname/members/export', authorize(['Club Admin']), function (req, res) {
        
                var clubname = req.params.clubname;
                models.members.find({ 'club.name': clubname })
                    .select('firstName lastName lastPaxClass lastAxClass dedicatedNumber clubMemberId currentEmail')
                    .sort({'lastName':1, 'firstName':1})
                    .exec(function (err, members) {
                        var cols = ['firstName','lastName','lastPaxClass','lastAxClass','dedicatedNumber','clubMemberId','currentEmail']
                        var tsv = [];
                        if (members.length > 0){
                            //do headers
                            // var headers = [];
                            // for (var n in members[0]) {
                            //     if (cols.indexOf(n) > -1){
                            //         headers.push(n);
                            //     }
                            // }
                            // tsv.push(headers.join('\t'));
                            tsv.push(cols.join('\t'));

                            for (var i = 0; i < members.length; i++) {
                                var line = [];
                                // for (var n in members[i]){
                                //     if (cols.indexOf(n) > -1){
                                //         line.push(members[i][n]);
                                //     }
                                // }
                                for (var a = 0; a < cols.length; a++) {
                                    line.push(members[i][cols[a]]);
                                };
                                tsv.push(line.join('\t'));
                            };
                        }
                        res.setHeader('Content-Disposition', 'attachment;filename=axtime-members.tsv');
                        res.setHeader("Content-Type", "text/tsv");
                        res.send(tsv.join('\n') + '\n');


                });
           
    });

    app.get('/api/:clubname/members/numexists', function(req,res){
        var clubname = req.params.clubname;
        res.send('not implemented');
    });
    //
    // EVENTS DATA
    //

    //get event list for club
    app.get('/api/events/:clubname', function (req, res) {
        var clubname = decodeURIComponent(req.params.clubname);
        //validate club and user

        if (clubname.length > 1) {
            models.events.find({ 'club.name': clubname }).sort({ 'date': -1 }).exec(function (err, events) {
                res.send({ status: 'success', items: events });
            });
        } else {
            res.send({ status: 'error', message: 'invalid' });
        }
    });

    app.get('/api/clubs', function(req,res){
        models.clubs.find({}).select('name _id').exec(function(er, clubs){
            console.log('api get clubs')
            res.send(clubs);
        })
    })

    app.get('/api/club/:clubname/events', function(req,res){
        var clubname= req.params.clubname;
        models.events.find({ 'club.name': clubname }).select('_id name dateInt').sort({ 'date': -1 }).exec(function (err, events) {
            res.send(events);
        });
    });

    app.get('/api/club/:clubname/getliveevent', function(req,res){
        var clubname= req.params.clubname
            , todayInt = utils.date2int(new Date());
        models.events.findOne({ 'club.name': clubname, dateInt:todayInt })
            .select('_id name dateInt').exec(function (err, ev) {
                res.send({data:ev});
        });
    });


    app.post('/api/liveevent/login', function(req,res){
        console.log('api live event role login');
        var todayInt = utils.date2int(new Date())
            , password = req.body.password
            , role = req.body.role;
        var result = {
            sessionId:null
            , eventId:null
            , success:false
            , message: 'Invalid'
        }

        result.sessionId = req.session.id;
        models.events.findOne({dateInt: todayInt}, function(er, ev){
            if (er){
                result.message = "Error in the database";
                res.send(result);
            } else if (!ev){
                result.message = "No event with today's date was found.";
                res.send(result);
            } else {
                models.users.findOne({eventId:ev._id.toString(), role:role}, function(er, user){
                    if (er || !user){
                        result.message = 'The ' + role + ' is not configured for the event.';
                    } else if (utils.encrypt(password) != user.epassword) {
                        result.message = 'Incorrect password.';
                    } else {
                        result.success = true;
                        result.message = 'Success';
                        result.eventId = ev._id.toString();
                        result.sessionId = req.session.id;
                    }
                    res.send(result);
                });
            }
        });
    });

    // app.post('/api/:clubname/liveevent/login/:role',function(req,res){
    //     console.log('api liveevent role login')
    //     var clubname= req.params.clubname
    //         , todayInt = utils.date2int(new Date())
    //         , rolePassword = req.body.pw
    //         , role = req.params.role;
    //     console.log('role: ' + role)
    //     console.log('role pw: ' + rolePassword);

    //     var result = {
    //         sessionId:null
    //         , eventId:null
    //         , success:false
    //         , message: 'Invalid'
    //     }
    //     models.events.findOne({ 'club.name': clubname, dateInt:todayInt })
    //         .select('_id name dateInt workerRoles').exec(function (er, ev) {
    //             if (er){
    //                 console.log('error');
    //                 //TODO handle it
    //                 result.message = 'ERROR: ' + er;
    //                 res.send(result);
    //             }
    //             else if (ev == null) {
    //                 result.message = 'No live event found.';
    //                 res.send(result);
    //             } else {
    //                 var roleFound = false;
    //                 for (var r in ev.workerRoles){

    //                     if (ev.workerRoles[r].role == role){
    //                         console.log('role found');
    //                         roleFound = true;
    //                         if (ev.workerRoles[r].password == rolePassword){
    //                             result.eventId = ev._id.toString();
    //                             result.success = true;
    //                             req.session.auth = { role: role, clubname: clubname, eventid: ev._id };
    //                             result.sessionId = req.session.id;
    //                             result.message= '';
                                
    //                         } else {
    //                             //TODO
    //                             //console.log('pass not match: ' + ev.workerRoles[r].password + ' : ' + rolePassword);
    //                         }
    //                         break;
    //                     }
    //                 }
    //                 if (roleFound && result.success)
    //                     res.send(result);
    //                 else if (roleFound){
    //                     result.message = 'Invalid password';
    //                     res.send(result);
    //                 }
    //                 else {
    //                     result.message = role + ' is not configured for this event';
    //                     res.send(result);
    //                 }
    //             }
    //     });
    // });
    ////get event data
    //app.get('/api/events/:id', function (req, res) {
    //    var club = req.params.clubname
    //        , id = req.params.id;

    //    if (club != null) {

    //    } else {

    //    }
    //});

    


    function generateEventReport(ev, parts, runs){

        function getRuns(partId){
            var result = [];
            for (var i=0;i<runs.length;i++){
                if (runs[i].participantId.toString() == partId){
                    result.push(runs[i]);
                }
            }
            result.sort(function(a,b){
                return a.runNumber < b.runNumber ? -1 : 1;
            })
            return result;
        }

        var cClass = '';
        var buttonCss = fs.readFileSync('./public/css/results-report.css');

        var start = '<html><head><title>AXti.me Event Results:  ' + ev.name + '</title><style>'
        + buttonCss
        + '</style></head><body><div style="float:right;">Participants: ' + parts.length + '<br/>Runs: ' + runs.length + '</div><h1>' + ev.club.name + '</h1><h2 style="margin-bottom:4px;">' + ev.name + '</h2><h4 style="margin-top:0px;">' + ev.date + '</h4><div class="clearfix"></div>'
        + '<p><button class="btn btn-large btn-info" onclick="showo()">Overall</button><button class="btn btn-large btn-success" onclick="showc()">Class</button><button class="btn btn-large btn-warning" onclick="showp()">PAX</button></p>';
        // table headers
        
        var best = 0;
        var unranked = [];

        var overall=[]
            , cls = []
            , pax = []
            ;

        //sort for class
        for (var i=0;i<parts.length;i++){
            var pt = parts[i];
            //console.log(pt._id);
            parts[i].axClass.sorting = pt.axClass.paxClass.length > 0 ? pt.axClass.paxClass : pt.axClass.name;
        }

        parts.sort(function(a,b){
            if (a.axClass.sorting == b.axClass.sorting)
                return a.rankClass > b.rankClass ? 1 : -1;
            else
                return a.axClass.sorting > b.axClass.sorting ? 1 : -1;
        })
        //do class
        cls.push('<table id="result-class"><thead><tr><th colspan="7">Class</th></tr><tr><th>Position</th><th>Driver</th><th>Car</th><th>Best</th><th>Diff.</th><th>Diff. Prev.</th><th>Raw Times</th></tr></thead><tbody>');
        overall.push('<table id="result-overall" style="display:none;"><thead><tr><th colspan="8">Overall</th></tr><tr><th>Rank</th><th>Class</th><th>Driver</th><th>Car</th><th>Best</th><th>Diff.</th><th>Diff. Prev.</th><th>Raw Times</th></tr></thead><tbody>')
        pax.push('<table id="result-pax" style="display:none;"><thead><tr><th colspan="8">PAX</th></tr><tr><th>Rank</th><th>Class</th><th>Driver</th><th>Car</th><th>Best</th><th>Diff.</th><th>Diff. Prev.</th><th>Raw Times</th></tr></thead><tbody>')
        for (var i=0;i<parts.length;i++){

            var p = parts[i];
            if (p.rankClass == 0){
                unranked.push(p);
            }
            else {
                var tclass = p.axClass.name;
                var tusePaxTime = false;
                if (p.axClass.paxClass.length > 0){
                    tusePaxTime = true;
                    tclass = p.axClass.paxClass;
                }
                if (cClass != tclass){
                    cls.push('<tr class="divider"><td colspan="7">' + tclass + '</td></tr>');
                    cClass = tclass;
                    best = p.bestTime;
                }
                var diff = p.diffClass;//Math.round((p.bestTime - best) * 1000) / 1000;
                if (diff == 0)
                    diff = '-';
                else
                    diff = '+' + diff;

                var diffp = p.diffPrevClass;
                if (diffp == 0)
                    diffp = '-';
                else
                    diffp = '+' + diffp;
                cls.push('<tr class="row"><td align="center">' + p.rankClass + '</td><td nowrap>' + p.driver.name + ' #' + p.driver.carNumber + '</td><td nowrap>' + p.driver.car.description  + '</td><td><strong>' + (tusePaxTime ? p.bestPaxTime : p.bestTime) + '</strong></td><td>' + diff + '</td><td>' + diffp + '</td><td>');
                //do times
                var pruns = getRuns(p._id.toString());
                var runshtml = [];
                var bestTime = p.bestTime;
                for (var r=0;r<pruns.length;r++){
                    var time = pruns[r].rawTime.toFixed(3)
                        , isBest = pruns[r].totalTime == bestTime;

                    if (pruns[r].cones > 0){
                        time = time + ' <span class="pen">+' + pruns[r].cones + '</span>';
                    }
                    if (pruns[r].isDnf)
                        time = '<span class="pen">DNF</span>';
                    else if (pruns[r].getsRerun)
                        time = time + ' <span class="pen">RRN</span>';
                    else if (pruns[r].isOff)
                        time = '<span class="pen">OFF</span>';

                    runshtml.push('<div class="time' + (isBest ? ' best':'') + '">' + time  + '</div>');
                }
                cls.push(runshtml.join(''));
                cls.push('<div style="clear:left"></div></td></tr>');
                parts[i].runshtml = runshtml.join('');
            }
        }
        //TODO handle unranked?
        cls.push('</tbody></table>');


        //do overall
        parts.sort(function(a,b){
            if (a.rankOverall == b.rankOverall)
                return a.driver.name < b.driver.name ? 1 : -1;
            else
                return a.rankOverall > b.rankOverall ? 1 : -1;
        });

        best = -1;
        for (var i=0;i<parts.length;i++){
            var p = parts[i];
            if (p.rankOverall > 0){
                if (best == -1)
                    best = p.bestTime;
                var diff = p.diffOverall;//Math.round((p.bestTime - best) * 1000) / 1000;
                if (diff == 0)
                    diff = '-';
                else
                    diff = '+' + diff;

                var diffp = p.diffPrevOverall;
                if (diffp == 0)
                    diffp = '-';
                else
                    diffp = '+' + diffp;
                overall.push('<tr class="row"><td>' + p.rankOverall + '</td><td>' + p.axClass.name + '<td nowrap>' + p.driver.name + ' #' + p.driver.carNumber + '</td><td nowrap>' + p.driver.car.description  + '</td><td><strong>' + p.bestTime + '</strong></td><td>' + diff + '</td><td>' + diffp + '</td><td>');
                //do times
                overall.push(p.runshtml);
                overall.push('<div style="clear:left"></div></td></tr>');
            }
        }
        overall.push('</tbody></table>');


        //do pax
        parts.sort(function(a,b){
            if (a.rankOverall == b.rankOverall)
                return a.driver.name < b.driver.name ? 1 : -1;
            else
                return a.rankPax > b.rankPax ? 1 : -1;
        });
        best = 0;
        for (var i=0;i<parts.length;i++){
            var p = parts[i];
            if (p.rankPax > 0){
                if (best == 0)
                    best = p.bestPaxTime;

                var diff = p.diffPax;//Math.round((p.bestPaxTime - best) * 1000) / 1000;
                if (diff == 0)
                    diff = '-';
                else
                    diff = '+' + diff;

                var diffp = p.diffPrevPax;
                if (diffp == 0)
                    diffp = '-';
                else
                    diffp = '+' + diffp;
                pax.push('<tr class="row"><td>' + p.rankPax + '</td><td>' + p.axClass.name + '<td nowrap>' + p.driver.name + ' #' + p.driver.carNumber + '</td><td nowrap>' + p.driver.car.description  + '</td><td><strong>' + p.bestPaxTime + '</strong></td><td>' + diff + '</td><td>' + diffp + '</td><td>');
                //do times
                pax.push(p.runshtml);
                pax.push('<div style="clear:left"></div></td></tr>');
            }
        }
        pax.push('</tbody></table><div>Created by <a href="http://www.axti.me">AXti.me</a></div>');


        var end = '<script>'
        + 'var c = document.getElementById("result-class");'
        + 'var o = document.getElementById("result-overall");'
        + 'var p = document.getElementById("result-pax");'
        + 'function showc(){c.style.display="";o.style.display="none";p.style.display="none";}'
        + 'function showo(){c.style.display="none";o.style.display="";p.style.display="none";}'
        + 'function showp(){c.style.display="none";o.style.display="none";p.style.display="";}'
        + '</script></body></html>';

        return start + cls.join('') + overall.join('') + pax.join('') + end;
    }



    app.get('/api/event/:eid/reports/uploadtocloud', authorize(['Club Admin']), function(req,res){
        var result = {success:false, message:'Invalid.'}
       
            var eid = req.params.eid;
            models.events.findById(eid, function(er,ev){
                if (ev != null){
                    
                    //loop thru parts
                    models.participants.find({eventId:eid}).sort({'axClass.name':1, rankClass:1}).exec(function(er,parts){
                        models.runs.find({eventId:eid, status:'F'}).sort({participantId:1}).exec(function(er, runs){
                            var html = generateEventReport(ev, parts, runs);
                            
                                var r = request.post(settings.rmLiveUrl + '/api/results?cloudkey=' + settings.cloudKey, function cb(er, resp, bod){
                                    try {
                                        if (er){
                                            res.send({success:false, message:er})
                                        }
                                        else {
                                            console.log('upload: ' + er);
                                            console.log(bod);
                                            var d = JSON.parse(bod);
                                            if (d.success){
                                                ev.rmLiveUrl = d.url;
                                                ev.save();
                                                result.message = d.message;
                                                result.success = d.success;
                                                result.url = d.url;
                                                res.send(result);
                                            }
                                            else if (d.message !== undefined && d.message.length > 0){
                                                res.send({success:false, message: d.message});
                                            }
                                            else {
                                                res.send({success:false, message: 'Unknown error occurred.'});
                                            }
                                        }
                                    }
                                    catch (ex){
                                        console.log('error caught: ' + er);
                                        res.send({success:false, message: er});
                                    }
                                    
                                })
                                var form = r.form();
                                form.append('htmlData', html);
                                form.append('cloudKey', settings.cloudKey);
                                form.append('season', ev.season);
                                form.append('eventNumber', ev.eventNumber);
                                form.append('eventName', ev.name);
                                form.append('eventDateInt', ev.dateInt);
                                form.append('eventId', ev._id.toString())
                           
                            
                        
                        })
                    })
                }
                else {
                    result.message = 'Event not found.';
                    res.send(result);
                }
             })
        
        
    });


    // // return json {success:t/f, message:''}
    // app.get('/api/event/:eid/reports/uploadtocloud/:cloudKey', function(req,res){
    //     if (req.session.auth && req.session.auth.role == 'Club Admin') {
            
    //         var cloudKey = req.params.cloudKey;
    //         var eid = req.params.eid;
    //         var result = {success:false, message:'Invalid.'}
    //          models.events.findById(eid, function(er,ev){
    //             if (ev != null){
                    
    //                 //loop thru parts
    //                 models.participants.find({eventId:eid}).sort({'axClass.name':1, rankClass:1}).exec(function(er,parts){
    //                     models.runs.find({eventId:eid, status:'F'}).sort({participantId:1}).exec(function(er, runs){
    //                         var html = generateEventReport(ev, parts, runs);
    //                         try 
    //                         {
    //                             var r = request.post('http://api.axti.me/Results/Event/' + eid, function cb(er, resp, bod){
    //                                 console.log('upload: ' + er);
    //                                 console.log(bod);
    //                                 var d = JSON.parse(bod);
    //                                 if (d.success){
    //                                     result.message = d.message;
    //                                     result.success = d.success;
    //                                     result.url = d.url;
    //                                     res.send(result);
    //                                 }
    //                                 else if (d.message !== undefined && d.message.length > 0){
    //                                     res.send({success:false, message: d.message});
    //                                 }
    //                                 else {
    //                                     res.send({success:false, message: 'Unknown error occurred.'});
    //                                 }
                                    
    //                             })
    //                             var form = r.form();
    //                             form.append('htmlData', html);
    //                             form.append('clubKey', cloudKey);
    //                             form.append('eventName', ev.name);
    //                         }
    //                         catch (er){
    //                             res.send({success:false, message: er});
    //                         }
                            
                        
    //                     })
    //                 })
    //             }
    //             else {
    //                 result.message = 'Event not found.';
    //                 res.send(result);
    //             }
    //          })
    //     }
    //     else {
    //         res.send({success:false, message:'Not authorized.'});
    //     }
    // })

    app.post('/api/event/:eid/rmlive/sync', authorize(['Club Admin','Event Admin','Time Keeper']), function(req,res){
        var eid = req.params.eid;

        engine.syncLiveEvent(eid, function(er){
            res.send({success:!er, message:er || ''})
        })
    })

    app.get('/api/event/:eid/reports/full', function(req,res){
         var eid = req.params.eid;
         
         models.events.findById(eid, function(er,ev){
            if (ev != null){
                
                //loop thru parts
                models.participants.find({eventId:eid}).sort({'axClass.name':1, rankClass:1}).exec(function(er,parts){
                    models.runs.find({eventId:eid, status:'F'}).sort({participantId:1}).exec(function(er, runs){
                        var html = generateEventReport(ev, parts, runs);

                        res.send(html);
                    })
                })
            }
            else 
                res.send('Invalid');
         })
            
    })

    app.get('/api/event/:eid/recalcEvent', function(req,res){
        var eid = req.params.eid
            , result = {success:true, message:''};

        engine.recalcEvent(eid, function(er){
            if (er){
                result.success = false;
                result.message = 'ERROR: ' + er;
            }
            res.send(result);
        });

    })

    app.get('/api/event/:eid/participants', function(req,res){
        //TODO authenticate?
        var eid = req.params.eid;

        models.participants.find({eventId:eid}, function(er, parts){
            if (er) res.send(500);
            else res.send(parts);
        })
    })

    app.get('/api/event/export/:id', function (req, res) {
        var eid = req.params.id
            , seprun = req.query['seprun']
            , nparts = [], event=null;


        function bad() {
            res.send('Invalid request.  not authorized');
        }
        function getRuns(list) {
            var nlist = list.slice(0);
            var p = nlist.shift();
            models.runs.find({ eventId: p.eventId, participantId:p._id.toString(), status:'F' }, function (er, runs) {
                //console.log(p.driver.name + ': ' + runs.length);
                p.runs = runs;
                nparts.push(p);

                if (nlist.length > 0)
                    getRuns(nlist);
                else
                    doExport();
            });
        }
        function doExport(){
            var out = [], maxRuns = 0;

            nparts.sort(function (a, b) {
                var aa = a.rankOverall == 0 ? 99999 : a.rankOverall
                    , bb = b.rankOverall == 0 ? 99999 : b.rankOverall;
                
                return aa > bb ? 1 : -1;
            });
            for (var i = 0; i < nparts.length; i++) {
                var p = nparts[i];
                var aname = p.driver.name.split(' ')
                    , fname = aname.shift()
                    , lname = aname.join(' ');
                var outp = '"' + fname+ '","' + lname + '","' + p.driver.clubMemberId + '","' + p.driver.carNumber + '","' + p.driver.car.description + '","' + p.axClass.name 
                    + '","' + (p.bestTime > 0 ? p.bestTime.toFixed(3) : (
                        p.totalRuns > 0 ? 'DNF' : '-'
                        )) + '","' 
                    + (p.bestPaxTime > 0 ? p.bestPaxTime.toFixed(3) : '-') + '","' 
                    + (p.rankClass > 0 ? p.rankClass : '-') + '","' 
                    + (p.rankPax > 0 ? p.rankPax : '-') + '","' 
                    + (p.rankOverall > 0 ? p.rankOverall : '-') + '","'
                    + (p.isRookie || '') + '"';
                if (maxRuns < p.runs.length) maxRuns = p.runs.length;

                for (var r = 0; r < p.runs.length; r++) {
                    if (seprun == '1') {
                        //separate out the penalty column
                        var tx = ',"' + p.runs[r].rawTime + '","';
                        if (p.runs[r].isDnf) tx += 'DNF';
                        else if (p.runs[r].getsRerun) {
                            tx += 'RERUN';
                            if (p.runs[r].cones > 0)
                                tx += ' ' + p.runs[r].cones;
                        }
                        else if (p.runs[r].isOff) tx += 'OFF';
                        else if (p.runs[r].cones > 0) tx += p.runs[r].cones.toString();
                        tx += '"';
                        outp += tx;
                    } else {
                        var nn = '';
                        if (p.runs[r].isDnf) nn = 'DNF';
                        else if (p.runs[r].getsRerun) nn = 'RERUN';
                        else if (p.runs[r].isOff) nn = 'OFF';
                        else {
                            nn = p.runs[r].rawTime + (p.runs[r].cones > 0 ? (' +' + p.runs[r].cones) : '');
                        }
                        outp += ',"' + nn + '"';
                    }
                }
                out.push(outp);
            }
            var header = '"FirstName","LastName","MemberNumber","CarNumber","Car","Class","Best","Best Indexed","ClassRank","IndexRank","OverallRank","Rookie"';
            for (var r = 1; r <= maxRuns; r++) {
                header += ',"Run ' + r + '"';
                if (seprun == '1')
                    header += ',"Run ' + r + ' Pen"';
            }
            res.setHeader('Content-Disposition', 'attachment;filename=axtime-event-' + event.season + '-' + event.dateInt + '.csv');
            res.setHeader("Content-Type", "text/csv");
            res.send(header + '\n' + out.join('\n'));
        }

        
        models.events.findById(eid, function (ere, ev) {
            if (ev) {
                event = ev;
                models.participants.find({ eventId: eid }, function (er, parts) {
                    getRuns(parts);
                });
            } else { bad(); }
        });
   
    });

    app.get('/api/announcer/:runid', function (req, res) {
        var rid = req.params.runid
            //, eid = req.params.eventid
            , msg = '';

        function bad(m) { res.send({ status: 'error', message: m }); }
        models.runs.findById(rid, function (er, run) {
            if (run) {
                var find = { eventId: run.eventId } //, 'axClass.name': run.axClass.name
                if (run.axClass.name.indexOf('-') > -1){
                    
                    find['axClass.paxClass'] = run.axClass.paxClass;
                } else {
                    find['axClass.name'] = run.axClass.name;
                }
                models.participants.find({eventId:run.eventId}).sort({'rankClass': 1}).exec(function (er1, parts) {
                    models.runs.find({participantId:run.participantId}).sort({driverRunNumber:1})
                        .exec(function(er,runs){
                            var obj = { status: 'success', message: '', participants: parts, runs:runs };
                            if (er) {obj.status = 'error';obj.message = 'Error: ' + er; }
                            
                            res.send(obj);
                        })
                    
                });
            }
            else { bad('Invalid run.'); }
        });


    });

    app.post('/api/event/changesession/:id', authorize(['Club Admin','Event Admin','Time Keeper']), function (req, res) {
        var eid = req.params.id
        , session = parseInt(req.body.session)
        , runGroup = req.body.runGroup
        , rg = { name: 'None', color: 'white', label:'' };
        //TODO auth
        switch (runGroup.toLowerCase()) {
            case 'red':
                rg.name = 'Red';
                rg.color = 'red';
                break;
            case 'blue':
                rg.name = 'Blue';
                rg.color = 'blue';
                break;
            case 'green':
                rg.name = 'Green';
                rg.color = 'green';
                break;
            case 'yellow':
                rg.name = 'Yellow';
                rg.color = 'yellow';
                break;
            case 'orange':
                rg.name = 'Orange';
                rg.color = 'orange';
                break;

        }
        console.log('changesession');
        models.events.findById(eid, function (er, event) {
            if (event) {
                
                for (var i = 0; i < event.runGroups.length; i++) {
                    var rrg = event.runGroups[i];
                    if (rrg.name == runGroup){
                        rg.color = rrg.color;
                        rg.label = rrg.label;
                        break;
                    }   
                };
                event.currentRunGroup = rg;
                event.currentSession = session;
                event.save(function (er) {
                    console.log('success');
                    res.send({status:'success', message:''});
                });
            } else {
                res.send({status:'error',message:'Invalid request.'});
            }
        });
    });

    //delete an event including runs and participants
    app.delete('/api/events/:id', authorize(['Club Admin']), function (req, res) {
        var eid = req.params.id;
        
        models.events.findOne({ _id: eid }, function (ere, ev) {
            if (ev) {
                models.runs.remove({ eventId: eid }, function (err) {
                    if (err) {
                        res.send({ status: 'error', message: 'Failed during runs delete with ' + err });
                    } else {
                        models.participants.remove({ eventId: eid }, function (erp) {
                            if (erp) {
                                res.send({ status: 'error', message: 'Failed during participant delete with ' + erp });
                            } else {
                                ev.remove(function (er) {
                                    res.send({ status: er ? 'error' : 'success', message: er });
                                });
                            }
                        });
                    }

                });

            } else {
                res.send({ status: 'error', message: 'Delete failed.  Either you do not have access to it or it does not exist.' });
            }
        });
    
       
    });



    //add event
    app.post('/api/events', authorize(['Club Admin']), function (req, res) {
        var data = req.body;
        //TODO validate club and user
        var datetouse = data.date;
        var dateInt = 0;
        if (data.date.indexOf('-') > -1) {
            var dd = data.date.split('-');
            if (parseInt(dd[0]) > 1900) {
                datetouse = dd[1] + '/' + dd[2] + '/' + dd[0];
            }
        }
        var dd = new Date(datetouse);
       
        dateInt = dd.getFullYear() * 10000 + (dd.getMonth() + 1) * 100 + dd.getDate();
        //console.log('date: ' + data.date);
        //console.log('date: ' + datetouse);

        var clubname = data.club
            , clubid = data.clubid
            , eventId = data.eid || ''
            , date = datetouse
            , sessions = data.sessions
            , season = new Date(date).getFullYear()
            , eventNumber = data.eventNumber
            , location = data.location
            , locationCoords = data.locationCoords
            , workerRoles = data.workerRoles || []
            , stations = []
            , courseMap = { url: '', designer: '' }//TODO
            , runGroups = data.runGroups
            , countit = data.countit == 'true'
            , uploadResults = data.uploadResults == 'true'
            , name = ''
            , isEdit = eventId != ''
            , coneCounterAdvancedMode = data.ccam
            , conePenalty = data.conePenalty
            , splitCount = data.splitCount
            , maxRuns = data.maxRuns
            , uniqueNumberPerClass = data.uniqueNumberPerClass == 'true'
            
        ;

        function doWorkerRoles(_ev){
            function saveWorkerRole(){
                var wr = workerRoles.shift();
                if (wr === undefined) res.send({ status: 'success', item: _ev });
                else {
                    var u = new models.users();

                    u.eventId = eventId;
                    u.firstName = wr.role.split(' ')[0];
                    u.lastName = wr.role.split(' ')[1] || '';
                    u.email = '';
                    u.username = eventId + '||' + wr.role;
                    u.role = wr.role;
                    u.epassword = utils.encrypt(wr.password);
                    u.save(function(er){
                        console.log('Saved worker role user: ' + er);
                        saveWorkerRole();
                    })
                }
            }
            models.users.remove({eventId:eventId}, function(er, cnt){
                console.log('Removed ' + cnt + ' worker roles users: ' + er);
                saveWorkerRole();    
            })
            
        }
        
        //console.log(workerRoles);
        for (var i = 0; i < (data.stations || []).length; i++) {
            stations.push({ name: data.stations[i] });
        }
        
        models.clubs.find({ name: clubname }, function (err, clubs) {
            var club = clubs[0];
            if (clubs.length == 1) {
                name = season + ' ' + club.shortName + ' #' + (eventNumber < 10 ? '0' + eventNumber : eventNumber);
            }
            clubid = club._id;
            var ev = null;
            if (isEdit) {
                models.events.findOne({ _id: eventId }, function (ere, ev) {
                    var ns = [];
                    //must do this way to not erase existing checkins
                    for (var b = 0; b < stations.length; b++) {
                        var exists = false;
                        for (var a = 0; a < ev.stations.length; a++) {
                            if (ev.stations[a].name == stations[b].name) {
                                ns.push(ev.stations[a]);
                                exists = true;
                                break;
                            }
                        }
                        if (!exists) {
                            ns.push({name:stations[b].name, checkins:[]});
                        }
                    }
                    ////check exists stations against incoming
                    //// if !exists delete it
                    //for (var a = 0; a < ev.stations.length; a++) {
                    //    for (var b = 0; b < stations.length; b++) {
                    //        var exists = false;

                    //        if (ev.stations[a].name == stations[b].name) {
                    //            exists = true;
                    //        }
                    //    }
                    //    if (!exists) {
                    //        ev.stations[a].remove();
                    //    }
                    //}
                    //var ns = [];

                    ////reorder by incoming order (so adds are kept in order)
                    //for (var b = 0; b < stations.length; b++) {
                    //    for (var a = 0; a < ev.stations.length; a++) {
                    //        if (ev.stations[a].name == stations[b].name) {
                    //            ns.push(ev.stations[b]);
                    //            break;
                    //        }
                    //    }
                    //}
                    if (!ev.currentSession)
                        ev.currentSession = 1;
                    if (!ev.currentRunGroup)
                        ev.currentRunGroup = {name:'None', color:'white',label:''};
                    ev.name = name;
                    ev.club = { name: clubname, id: club._id };

                    ev.date = date;
                    ev.dateInt = dateInt;
                    ev.countForPoints = countit;
                    ev.sessions = sessions;
                    ev.season = season;
                    ev.stations = ns;
                    ev.eventNumber = eventNumber;
                    ev.location = { name: location, coords: locationCoords };
                    ev.workerRoles = workerRoles;
                    ev.conePenalty = conePenalty;
                    ev.runGroups = runGroups;
                    ev.uploadResults = uploadResults;
                    ev.coneCounterAdvancedMode = coneCounterAdvancedMode;
                    ev.numberOfSplits = splitCount;
                    ev.maxRunsPerDriver = maxRuns;
                    ev.uniqueNumberPerClass = uniqueNumberPerClass;

                    ev.save(function (err) {
                        if (err) { res.send({ status: 'error', message: err.toString() }); }
                        else {
                            doWorkerRoles(ev);
                            
                        }
                    });
                });
            }
            else {
                //TODO create save function for ev's fields (no duplicate code!!)
                ev = new models.events();
                ev.currentSession = 1;
                ev.currentRunGroup = { name: 'None', color: 'white' };
                ev.name = name;
                ev.club = { name: clubname, id: club._id };
                
                ev.date = date;
                ev.dateInt = dateInt;
                ev.countForPoints = countit;
                ev.sessions = sessions;
                ev.season = season;
                ev.stations = stations;
                ev.eventNumber = eventNumber;
                ev.location = { name: location, coords: locationCoords };
                ev.workerRoles = workerRoles
                //ev.courseMap = 
                ev.conePenalty = conePenalty;
                ev.runGroups = runGroups;
                ev.uploadResults = uploadResults;
                ev.coneCounterAdvancedMode = coneCounterAdvancedMode;
                ev.numberOfSplits = splitCount;
                ev.maxRunsPerDriver = maxRuns;
                ev.uniqueNumberPerClass = uniqueNumberPerClass;

                ev.save(function (err) {
                    if (err) { res.send({ status: 'error', message: err }); }
                    else {
                        eventId = ev._id.toString();
                        doWorkerRoles(ev);
                        
                    }
                });
            }
        });



    });


    app.post('/api/event/:id/assignrungroups', authorize(['Club Admin','Event Admin']), function(req,res){
        var eid = req.params.id, allow = false, result = {success:false, message:'Invalid'}
        
        // var classes = req.body.classes;
        // var paxClasses = req.body.paxClasses;

        var classRunGroups = req.body.classRunGroups;
        var applyToExistsingRuns = req.body.doExisting;        


            models.events.findOne({ "_id": eid }).select('_id club classRunGroups runGroups').exec(function (er, ev) {
                function getNewRunGroup(cls, pcls){

                    for (var i = 0; i < classRunGroups.length; i++) {
                        var crg = classRunGroups[i]
                    };


                    var rgn = null;
                    var rg = {name:'', color:'', label:''}
                    if (cls){
                        for (var i = 0; i < classes.length; i++) {
                            if (classes[i].name == cls){
                                rgn = classes[i].runGroup;
                                break;
                            }
                        };
                        if (rgn){
                            for (var i = 0; i < ev.runGroups.length; i++) {
                                if (ev.runGroups[i].name == rgn){
                                    rg.name = ev.runGroups[i].name;
                                    rg.color = ev.runGroups[i].color;
                                    rg.label = ev.runGroups[i].label;
                                    break;
                                }
                            };
                        }
                    }
                    else if (pcls){
                        for (var i = 0; i < paxClasses.length; i++) {
                            if (paxClasses[i].name == pcls){
                                rgn = paxClasses[i].runGroup;
                                break;
                            }
                        };
                        if (rgn){
                            for (var i = 0; i < ev.runGroups.length; i++) {
                                if (ev.runGroups[i].name == rgn){
                                    rg.name = ev.runGroups[i].name;
                                    rg.color = ev.runGroups[i].color;
                                    rg.label = ev.runGroups[i].label;
                                    break;
                                }
                            };
                        }
                    }

                    return rg;
                }

                function getNewRg(cls, pcls){
                    var rg = {name:'', color:'', label:''}
                    for (var i = classRunGroups.length - 1; i >= 0; i--) {
                        var tcrg = classRunGroups[i];
                        if (pcls && tcrg.paxClass == pcls)
                            return ev.runGroups[tcrg.runGroupIx];
                        else if (cls && tcrg.baseClass == cls)
                            return ev.runGroups[tcrg.runGroupIx];
                    };
                    return null;
                }
                function applyToExisting(){
                    models.participants.find({eventId: eid, 'club.id': ev.club.id}, function(er, parts){
                        if (er) {
                            result.message = 'Invalid event. ' + er;
                            res.send(result);
                        }
                        var list = parts.slice(0);
                        function doone(){
                            var p = list.shift();
                            if (p === undefined){
                                
                                result.success = true;
                                result.message = 'All good';
                                res.send(result);
                            }
                            else {
                                // var c = p.axClass.paxClass.length > 0 ? null : p.axClass.name
                                //     , pc = p.axClass.paxClass;
                                var nrg = getNewRg(p.axClass.name, p.axClass.paxClass);
                                p.runGroup = nrg;
                                p.save(function(er){
                                    //TODO handle er
                                    doone();
                                })
                            }
                        }
                        doone()
                    });
                }

                if (ev){

                    var crgs = [];
                    for (var i = 0; i < classRunGroups.length; i++) {
                        var crg = classRunGroups[i];
                        crgs.push({baseClass:crg.baseClass, paxClass:crg.paxClass, runGroup:ev.runGroups[crg.runGroupIx].name})
                    };
                    ev.classRunGroups = crgs;
                    ev.save(function(er){
                        if (applyToExistsingRuns){
                            applyToExisting();
                        }
                        else {
                            res.send({success:!er, message:er || ''})
                        }
                    })
                        
                }
                else if (er){
                    result.message = 'Invalid event. ' + er;
                    res.send(result);
                }
                else {
                    result.message = 'The event was not found in the system.';
                    res.send(result);
                }
            });

        
    })


    app.post('/api/event/:id/importmsr', authorize(['Club Admin','Event Admin']), function(req,res){
        var eid = req.params.id, allow = false
            , result = {success:false, participants:[], message:''}
            , importedParticipants = [];

        var username = req.body.msrUsername
            , password = req.body.msrPassword
            , orgId = req.body.msrOrgId
            , msrEventId = req.body.msrEventId;

            models.events.findOne({ "_id": eid }, function (err, ev) {
                var msr = require('../lib/msr.js')(orgId, username, password);
                msr.getParticipants(msrEventId, function(er,data){
                    if (er){
                        result.message = 'ERROR: ' + er;
                        res.send(result);
                    }
                    else {
                        if (data.length > 0){
                            var parseAxClassForPax = true;
                            //convert data to registrationEntry's
                            var regList = [];
                            try {
                                for (var i=0;i<data.length;i++){
                                    var rege = new importer.registrationEntry();
                                    var dd = data[i];
                                    rege.firstName = dd.firstName;
                                    rege.lastName = dd.lastName;
                                    rege.clubMemberId = dd.memberId;
                                    rege.msrId = dd.uid;
                                    rege.carNumber = dd.vehicleNumber;
                                    //handle good MSR data
                                    if (dd.classModifierShort !== undefined && dd.classShort !== undefined){
                                        parseAxClassForPax = false;
                                        if (dd.classModifierShort.length > 0){
                                            rege.axClass = dd.classModifierShort.replace('-','');
                                            rege.paxClass = dd.classShort.replace('-','');
                                            //rege.paxClass = dd.classModifierShort.replace('-','');
                                            //rege.axClass = dd.classShort.replace('-','');
                                            console.log('pax class found' + rege.axClass + ':' + rege.paxClass);
                                        } else {
                                            rege.axClass = dd.classShort;
                                        }
                                    }
                                    else 
                                        rege.axClass = dd.class;

                                    rege.email = dd.email;
                                    rege.sponsor = dd.sponsor;
                                    rege.city = dd.city;
                                    rege.car = {description:dd.year + ' ' + dd.make + ' ' + dd.model + ' ' + dd.color
                                        , make:dd.make, model:dd.model, year:dd.year, color:dd.color};
                                                           
                                    regList.push(rege);
                                }
                            } 
                            catch (ex){
                                result.message = 'ERROR parsing MSR data: ' + ex;
                                res.send(result);
                            }
                            
                            //TODO don't forget to change the parseAxClass to false when MSR changes
                            importer.events.importRegistration(ev, regList, {parseAxClassForPax:parseAxClassForPax}, function(errors, parts){
                                if (errors.length > 0){
                                    result.message = 'Problems occurred during the import.  ' + errors.join(', ');
                                } else {
                                    result.success = true;

                                }
                                result.participants = parts;
                                res.send(result);
                            })
                        }
                        else {
                            res.send(result);
                        }
                    }
                });
            });
        
    });

    // do import from msr
    app.post('/api/event/:id/importmsr2', authorize(['Club Admin','Event Admin']), function(req,res){
        var eid = req.params.id, allow = false
            , result = {success:false, participants:[], message:''}
            , importedParticipants = [];

        var username = req.body.msrUsername
            , password = req.body.msrPassword
            , orgId = req.body.msrOrgId
            , msrEventId = req.body.msrEventId;

            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    models.clubs.findById(ev.club.id, function(er, club){

                        //TODO handle no club
                        var seasonYear = new Date().getFullYear();
                        models.seasons.findOne({clubId: club._id, seasonYear:seasonYear}, function(er, season){
                            //TODO validate season there
                            //TODO remove all participants?????
                            models.participants.remove({eventId:eid, isImported:true}).exec();
                            var msr = require('../lib/msr.js')(orgId, username, password);
                            msr.getParticipants(msrEventId, function(er,data){
                                if (er){
                                    result.message = er;
                                    res.send(result);
                                }
                                else {
                                    if (data.length > 0){

                                        //TODO remove all imported participants
                                        function addPart(mem, car, carnum, axclass) {
                                            //TODO check for part? or delete everyone imported
                                            console.log('add part');
                                            
                                            //extract pax class
                                            var tClass = null;

                                            var classFound = false
                                                , paxClass = '';
                                            //first check for pax class
                                            for (var px=0;px<season.paxClasses.length;px++){
                                                if (axclass.lastIndexOf(season.paxClasses[px].name, 0) === 0){
                                                    //pax class detected, trim 
                                                    console.log('pax class detected: ' + axclass);
                                                    paxClass = season.paxClasses[px].name;
                                                    axclass = axclass.substring(paxClass.length);
                                                }
                                            }
                                            
                                            for (var c = 0; c < season.classes.length; c++) {
                                                if (axclass == season.classes[c].name) {
                                                    tClass = season.classes[c];
                                                    tClass.paxClass = paxClass;
                                                    classFound = true;
                                                    break;
                                                }
                                            }

                                            if (paxClass != '' && classFound){
                                                tClass.name = paxClass + '-' + tClass.name;
                                            }

                                            if (!classFound) {
                                                tClass = { name: 'FUN', paxClass:'', category:'FUN', index: 1, isLadies: false, isStock: false };
                                                //newClasses.push(pd.first + ' ' + pd.last + ' - ' + pd.axclass);
                                            }
                                            // var useClass = axclass;
                                            // if (axclass.indexOf('-') > -1){
                                            //     taxclass = axclass.split('-');
                                            //     taxclass.shift();
                                            //     useClass = taxclass.join('');
                                            // }
                                            // var tClass=null;
                                            // for (var i=0;i<season.classes.length;i++){
                                            //     if (season.classes[i].name.toLowerCase() == useClass.toLowerCase()){
                                            //         tClass = season.classes[i];
                                            //         tClass.name = axclass;
                                            //         break;
                                            //     }
                                            // }
                                            // if (tClass == null){
                                            //     tClass = {name:'FUN', index:1.0, paxClass:'', isLadies:false, isStock:false}
                                            // }
                                            var p = new models.participants();
                                            p.eventId = eid;
                                            p.club = {name:club.name, id:club.id}
                                            p.memberId = mem._id;
                                            p.runGroup = { name: '', color: '' };
                                            p.driver = {
                                                name: mem.fullName
                                                , car:car
                                                , carNumber: carnum
                                                , clubMemberId: mem.clubMemberId
                                            }
                                            p.axClass = tClass;
                                            p.isImported = true;
                                            p.workerRole = 'None';
                                            p.save(function(er){
                                                if (!er) {
                                                    importedParticipants.push(p);
                                                }
                                                lookup();

                                            })

                                        }

                                        //TODO get all members for cached easy lookup
                                        function lookup(){
                                            var reg = data.shift();
                                            //console.log(reg);
                                            if (reg){
                                                var memId = '', msrId = reg.uid;
                                                var where = {};
                                                if (reg.memberId != undefined){
                                                    memId = reg.memberId;
                                                }
                                                if (memIdmemId.length > 0){
                                                    where.clubMemberId = memId;
                                                }
                                                else {
                                                    where.msrId = msrId;
                                                    memId = '';
                                                }
                                                //{$or:[{clubMemberId:memId}, {msrId:msrId}]}
                                                console.log(where);
                                                models.members.findOne(where, function(er,member){
                                                    if (er){
                                                        result.message = 'Error during member lookup database operation';
                                                        res.send(result);
                                                    }
                                                    else if (member){
                                                        console.log('member exists');
                                                        //member exists, add participant, cars?, etc
                                                        var car = {description:reg.year + ' ' + reg.make + ' ' + reg.model + ' ' + reg.color,
                                                            make:reg.make, model:reg.model, year:reg.year, color:reg.color};
                                                        var carNum = reg.vehicleNumber;
                                                        member.totalEvents =  member.totalEvents + 1;
                                                        member.msrId = reg.uid;
                                                        member.save();
                                                        //TODO lookup car
                                                        addPart(member, car, carNum, reg.class);
                                                    }
                                                    else {
                                                        console.log('creating new member');
                                                        var car = {description:reg.year + ' ' + reg.make + ' ' + reg.model + ' ' + reg.color,
                                                            make:reg.make, model:reg.model, year:reg.year, color:reg.color};
                                                        var carNum = reg.vehicleNumber;
                                                        //add member then participant
                                                        var newMember =new models.members();
                                                        newMember.club = {name:club.name, id:club.id.toString()}
                                                        newMember.firstName = reg.firstName;
                                                        newMember.lastName = reg.lastName;
                                                        newMember.clubMemberId = memId;
                                                        newMember.isMember = memId.length > 0;
                                                        newMember.msrId = reg.uid;
                                                        newMember.cars = [car];
                                                        newMember.totalEvents = 1;

                                                        //TODO do lookup of dedicated #
                                                        newMember.dedicatedNumber = '';
                                                        newMember.lastAxClass = '';
                                                        if (reg.email.length > 0)
                                                            newMember.emails = [{address:reg.email}]    
                                                        if (reg.city.length > 0)
                                                            newMember.address = [{city:reg.city, street:'', state:'',zip:'', addrType:'Unknown'}]
                                                        if (reg.sponsor.length > 0)
                                                            newMember.sponsors = [{name:reg.sponsor}];
                                                        newMember.dateCreated = new Date();
                                                        newMember.dateUpdated = new Date();
                                                        newMember.save(function(er){
                                                            if (!er){
                                                                console.log('new member saved');
                                                                addPart(newMember, car, carNum, reg.class);
                                                            }
                                                            else {
                                                                console.log('ERROR saving new member: ' + er);
                                                            }
                                                        })
                                                    }
                                                })
                                            } 
                                            else {
                                                result.success = true;
                                                result.participants = importedParticipants;
                                                ev.participantCount = importedParticipants.length;
                                                ev.save(function(er){
                                                    res.send(result);    
                                                })
                                                
                                            }// if reg
                                        } // fx lookup

                                        lookup();


                                    }
                                    else {
                                        result.message = "No registrations were returned from MSR.";
                                        res.send(result);
                                    }
                                }
                                
                            })
                        })
                    })
                        
                } else {
                    result.message = 'Invalid event.'
                    res.send(result);
                }
            }); // model.events
       
    });

    //return json of msr events for the login/orgid
    app.post('/api/event/:id/msrevents', authorize(['Club Admin','Event Admin']), function(req,res){
        var eid = req.params.id, allow = false
            , result = {success:false, events:[], message:''};

            var username = req.body.msrUsername
                , password = req.body.msrPassword
                , orgId = req.body.msrOrgId;
            models.events.findOne({ "_id": eid }, function (err, ev) {

                if (ev) {
                    models.clubs.findById(ev.club.id, function(er, club){
                        if (club){
                            var msr = require('../lib/msr.js')(orgId, username, password);
                            msr.getEvents(function(er, events){
                                if (er) {
                                    result.message = er;
                                    res.send(result);
                                } 
                                else {
                                    //save un/org id to club
                                    club.msrOrganizationId = orgId;
                                    club.msrUsername = username;
                                    club.save();
                                    result.events = events;
                                    result.success = true;
                                    res.send(result)
                                }

                            })
                        }
                        else {
                            result.message = 'Invalid club.'
                            res.send(result);
                        }
                    })
                    
                } else {
                    result.message = 'Invalid event.'
                    res.send(result);
                }
            }); // model.events
        
    });

    
    app.post('/api/club/:clubname/importmsr', authorize(['Club Admin']), function(req,res){
        var clubname = req.params.clubname
            , allow = false
            , result = {success:false, members:[], message:''};

            var username = req.body.msrUsername
                , password = req.body.msrPassword
                , orgId = req.body.msrOrgId;

            models.clubs.findOne({name:clubname}, function(er, club){
                if (er){ result.message = 'ERROR: ' + er;res.send(result);}
                else {
                    if (club == null){ result.message = 'Club not found.';res.send(result);}
                    else {
                        var msr = require('../lib/msr.js')(orgId, username, password);
                        msr.getMembers(function(er, members){
                            var membersAdded = [];

                            function lookup(){
                                var m = members.shift();
                                if (m) {
                                    models.members.findOne({msrId: m.id}, function(er, member){
                                        if (er){
                                            //TODO just ignore error and continue trying to add
                                            result.message = 'ERROR: ' + er;
                                            res.send(result);
                                        } else if (member == null) {
                                            // add new member
                                            var newMember = new models.members();
                                            newMember.club = {id:club._id.toString(), name:club.name}
                                            newMember.firstName = m.firstName;
                                            newMember.lastName = m.lastName;
                                            newMember.emails = [{address:m.email}];
                                            newMember.addresses = [
                                                {addrType:'billing', street:m.address1, street2:m.address2
                                                , city:m.city, state:m.region, zip:''}
                                            ];
                                            newMember.msrId = m.id;
                                            newMember.phones = [];
                                            if (m.phoneNumber.length > 0)
                                                newMember.phones.push({phoneType:'home', number:m.phoneNumber});
                                            if (m.mobileNumber.length > 0)
                                                newMember.phones.push({phoneType:'mobile', number:m.mobileNumber});
                                            if (m.workNumber.length > 0)
                                                newMember.phones.push({phoneType:'work', number:m.workNumber});
                                            newMember.dateCreated = new Date();
                                            newMember.dateUpdated = new Date();
                                            newMember.clubRegion = m.regionOfRecord;
                                            newMember.dedicatedNumber = '';
                                            newMember.lastAxClass = '';
                                            newMember.cars = [];
                                            newMember.clubMemberId = m.memberId;

                                            newMember.save(function(er){
                                                console.log('Added member: ' + m.firstName + ' ' + m.lastName);
                                                membersAdded.push(newMember);
                                                lookup();
                                            });
                                        
                                        } 
                                        else {
                                            lookup();
                                        }
                                    });
                                }
                                else {
                                    result.success = true;
                                    result.members = membersAdded;
                                    res.send(result);
                                } 
                            }   
                            if (er) { 
                                result.message = 'ERROR: ' + er;
                                res.send(result);
                            }
                            else {
                                club.msrUsername = username;
                                club.msrOrganizationId = orgId;
                                club.save();
                                lookup();
                            }
                              
                        });
                    }
                }
            }); // models.club
       
    });

    app.put('/api/techinspector/:eventid', function (req, res) {
        var eventid = req.params.eventid
            , pid = req.body.pid
            , isTechd = req.body.istechd == 'true';


        //TODO auth user to event
        models.events.findOne({ '_id': eventid }, function (err, event) {
            if (event != null) {
                models.participants.findOne({ 'eventId': eventid, _id: pid }, function (erp, p) {
                    if (p) {
                        p.isTechd = isTechd;
                        p.save(function (ers) {
                            res.send({ status: 'success', });
                        });
                    } else {
                        res.send({ status: 'error', message: 'Invalid participant.' });
                    }
                });
            }
            else {
                res.send({ status: 'error', message: 'Invalid event.' });
            }

        });
    });

    //verify car number available
    // app.post('/api/event/:eventId/checkcarnumber', function(req,res){
    //     var eid = req.params.eventId;

    //     var participantId = req.body.participantId
    //         , carNumber = req.body.carNumber
    //         ;

    //     var result = {success:false, message:'Invalid request'}
    //     function done(){
    //         res.send(result);
    //     }

    //     function checkParticipants(){
    //         models.participants.find({eventId:eid, 'driver.carNumber':carNumber}, function(er, parts){
    //             if (parts.length == 0){
    //                 // all good
    //             } else {
    //                 for (var i=0;i<parts.length;i++){
    //                     if (parts[i]._id.toString() == participantId){
    //                         //this is the requesting driver's, all good
    //                     }
    //                 }
    //             }
    //         })
    //     }

    //     if (carNumber.length == 0){
    //         res.message = 'Blank';
    //         done();
    //     }
    //     else {
    //         models.events.findById(eid, function(er, ev){
    //             if (er) {
    //                 result.message = 'Error: ' + er;
    //                 done();
    //             } else if (ev == null){
    //                 result.message = 'Event not found.';
    //                 done();
    //             } else {
    //                 models.participants.findById(participantId, function(er, part){
    //                     if (er) {
    //                         result.message = 'Error: ' + er;
    //                         done();
    //                     } else if (part == null){
    //                         result.message = 'Participant not found.';
    //                         done();
    //                     } else {
    //                         var memberId = part.memberId;
    //                         // first check other members for dedicated Number
    //                         models.members.find({'club.id':ev.club.id, dedicatedNumber:carNumber}, function(er, members){
    //                             if (er) {
    //                                 result.message = 'Error: ' + er;
    //                                 done();
    //                             } else if (members.length==0){
                                    
                                    
    //                             } else {
    //                         })
    //                         // second check event to see if exists already
    //                     }
    //                 })
    //             }
    //         })
    //     }
        

    // });

    // new season
    app.post('/api/season/:clubid', authorize(['Club Admin']), function (req, res) {

            var cid = req.params.clubid
                , year = req.body.year
                , maxpax = req.body.maxpax
                , maxcls = req.body.maxcls
                , classes = req.body.classes
                , paxClasses = req.body.paxclasses
                , paxpts = req.body.paxpts
                , clspts = req.body.clspts
                , conepen = req.body.conepen
                , qualify = req.body.eventsToQualify
                , classCalc = req.body.classCalc
                , classMinPoints = req.body.classMinPoints 
                , paxMinPoints = req.body.paxMinPoints
                , classCalcMethod = classCalc == '1' ? 'besttimediffpct' : null
                , status = 'error', message = ''
                , classPoints = [], paxPoints=[];
             
            //clean up and format
            for (var i = 1; i <= clspts.length; i++) {
                classPoints.push({position:i, points:clspts[i-1]});
            }
            for (var i = 1; i <= paxpts.length; i++) {
                paxPoints.push({position:i, points:paxpts[i-1]});
            }
            for (var i = 0; i < classes.length; i++) {
                classes[i].isLadies = classes[i].isLadies == 'true';
                classes[i].isStock = classes[i].isStock == 'true';
            }
            if (paxClasses){
                for (var i = 0; i < paxClasses.length; i++) {
                    paxClasses[i].isLadies = paxClasses[i].isLadies == 'true';
                    //classes[i].isStock = classes[i].isStock == 'true';
                }
            }
                

            function finish() { res.send({ status: status, message: message }); }
            function add() {
                console.log('do add');
                
                var s = new models.seasons();
                s.clubId = cid;
                s.seasonYear = year;
                s.paxMaxEvents = maxpax;
                s.classMaxEvents = maxcls;
                s.classPoints = classPoints;
                s.paxPoints = paxPoints;
                s.classes = classes;
                s.paxClasses = paxClasses;
                s.conePenalty = conepen;
                s.eventsToQualify = qualify;
                s.classPointsCalcMethod = classCalcMethod;
                s.minimumClassParticipationPoints =classMinPoints;
                s.minimumPaxParticipationPoints = paxMinPoints;
                
                s.save(function (ersave) {
                    if (ersave) { message = 'Error occurred during adding data.'; finish(); console.log(ersave); }
                    else { status = 'success'; message = ''; finish(); }
                });
            }
            function update(s) {
                console.log('do update');
                s.paxMaxEvents = maxpax;
                s.classMaxEvents = maxcls;
                s.classPoints = classPoints;
                s.paxPoints = paxPoints;
                s.classes = classes;
                s.paxClasses = paxClasses;
                s.conePenalty = conepen;
                s.eventsToQualify = qualify;
                s.classPointsCalcMethod = classCalcMethod;
                s.minimumClassParticipationPoints =classMinPoints;
                s.minimumPaxParticipationPoints = paxMinPoints;

                s.save(function (ersave) {
                    if (ersave) { message = 'Error occurred during saving data.'; finish(); console.log(ersave); }
                    else { status = 'success'; message = ''; finish(); }
                });
            }

            models.clubs.findOne({ _id: cid }, function (er1, club) {
                if (club) {
                    //lookup if season exists already
                    models.seasons.find({ clubId: cid, seasonYear: year }, function (er2, ss) {
                        if (ss.length == 1) {
                            update(ss[0]);
                        } else {
                            add();
                        }
                    });
                }
                else {
                    message = 'invalid club';
                    finish();
                }
            });
        
    });
    
    app.post('/api/drivercheckin/:eventid', authorize(['Club Admin','Event Admin','Registrar']), function (req, res) {
        var eventid = req.params.eventid
        , pid = req.body.pid
        , rg = req.body.runGroup
        , station = req.body.station
        , cls = req.body.axclass
        , role = req.body.role
        , newcar = req.body.newcar
        , defaultRg = {name:'', color:''}
        , rgFound = false
        ;
        //TODO auth user to event
       
        
        models.events.findOne({ '_id': eventid }, function (err, event) {
            if (event != null) {
                models.participants.findOne({ _id: pid }, function (erp, part) {
                    //get member record for car
                    //lookup rg, cls
                    part.workerRole = role;
                    part.station = station;
                    part.checkedIn = true;
                    
                    var cc = part.driver.car;



                    for (var i = 0; i < event.runGroups.length; i++) {
                        if (event.runGroups[i].name == rg) {
                            part.runGroup = event.runGroups[i];
                            rgFound = true;
                            break;
                        }
                    }
                    if (!rgFound){
                        part.runGroup = defaultRg;
                    }
                    for (var i = 0; i < event.stations.length; i++) {
                        if (event.stations[i].name == station) {
                            event.stations[i].assigned.push({ runGroup: rg, name: part.driver.name, session: 0 });
                            break;
                        }
                    }
                    function save() {
                        event.save(function (sere) {
                            part.save(function (serp) {
                                io.sockets.in(eventid + '-reg').emit('regchange', {action: 'update', data: part});
                                res.send({status:'success', item:part});
                            });
                        });
                    }

                    //if class is differnt look it up
                    if (part.axClass.name.toLowerCase() != cls.toLowerCase()) {
                        console.log('class is different: ' + cls);
                        var axclass = cls, paxclass='';

                        models.seasons.findOne({ 'clubId': event.club.id, seasonYear: event.season }, function (er1, season) {
                            if (season){
                                var classObj = utils.parseClass(cls, season.paxClasses, season.classes);
                                if (classObj != null){
                                    part.axClass = classObj;
                                    save();
                                } else {
                                    res.send({ status: 'error', message: 'Failed to find class.' });
                                }
                            }
                            else {
                                res.send({status: 'error', message: 'Season not setup for ' + event.season + '.'});
                            }
                        });


                        // if (axclass.indexOf('-') > -1){
                        //     paxclass = axclass.split('-')[0];
                        //     axclass = axclass.split('-')[1];
                        // }
                        // //console.log(paxclass + '-' + axclass);
                        // models.seasons.findOne({ 'clubId': event.club.id, seasonYear: event.season }, function (er1, season) {
                        //     if (season){
                        //         var classExists = false;
                        //         //TODO error handle no classes or no season
                        //         for (var i = 0; i < season.classes.length; i++) {
                                    
                        //             if (season.classes[i].name.toLowerCase() == axclass.toLowerCase()) {
                        //                 part.axClass = season.classes[i];
                        //                 if (paxclass.length > 0){
                        //                     part.axClass.name = paxclass + '-' + part.axClass.name;
                        //                 }
                        //                 classExists = true;
                        //                 break;
                        //             }
                        //         }
                        //         if (classExists)
                        //             save();
                        //         else
                        //             res.send({ status: 'error', message: 'Failed to find class.' });
                        //     } else {
                        //         res.send({status: 'error', message: 'Season not setup for ' + event.season + '.'});
                        //     }
                        // });
                        //models.clubClasses.findOne({ 'club.name': event.club.name, name: cls }, function (fer, iclass) {
                        //    if (iclass) {
                        //        part.axClass = iclass;
                        //        save();
                        //    } else {
                        //        res.send({ status: 'error', message: 'Failed to find class.' });
                        //    }
                        //});
                    } else {
                        save();
                    }

                });
            }
            else {
                res.send({ status: 'error', message: 'Invalid event.' });
            }
        });
    });

    app.get('/api/registration/:eventid', function (req, res) {
        var eventid = req.params.eventid;
        //TODO auth user to event

        //TODO clean this up, multiple db calls in combination with jade view
        models.events.findOne({ '_id': eventid }, function (err, event) {
            if (event != null) {
                
                models.participants.find({ 'eventId': eventid }, function (err, participants) {
                    //models.clubClasses.find({'club.name': event.club.name }, function (err, classes) {
                    res.send({ status: 'success', participants: participants, event: event });
                    //});
                });
            }
            else {
                res.send({ status: 'error', message: 'Invalid event id.' });
            }

        });

    });

    app.delete('/api/event/:eid/run/:id', authorize(['Club Admin','Event Admin','Time Keeper']), function(req,res){
        var runId = req.params.id 
            , eid = req.params.eid;
        //TODO
        //doAudit(req.auth.role, data + ': Delete run', eid);
        var start = new Date().getTime();
        //TODO authorize
        console.log('delete run: ' + runId + ' in event ' + eid);
        models.events.findOne({ _id: eid }, function (er2, event) {
            models.runs.findOne({ _id: runId, eventId: eid }, function (err, r) {
                r.remove(function (er3) {
                    if (!er3) {
                        io.sockets.in(eid + '-runs').emit('delr', runId);
                        models.runs.find({ eventId: eid }).sort({ runNumber: 1 }).exec(function (er1, runs) {
                            var runNum = 1;
                            for (var i = 0; i < runs.length; i++) {
                                runs[i].runNumber = runNum;
                                runs[i].save();
                                runNum++;
                            }

                            //models.participants.findOne({ eventId: r.eventId, 'axClass.name':r.axClass.name, 'driver.carNumber': r.driver.carNumber }, function (erp, part) {
                            models.participants.findOne({ eventId: r.eventId, _id:r.participantId }, function (erp, part) {

                                event.totalRuns = runNum - 1;
                                event.save();
                                var dur = new Date().getTime() - start;
                                console.log('delete run duration: ' + dur + 'ms');
                                //calcRun(r, part._id, true, true, true);
                                engine.calcRun(r, part._id, true, true, true, event);
                                //TODO update event .totalRuns

                            });
                        });//models.runs.all
                    }
                }); //r.remove()
            });//models.runs.One
        }); //model.events
    })

    //
    // PARTICIPANTS DATA
    //

    app.delete('/api/participants/:pid', authorize(['Club Admin','Event Admin','Registrar']), function (req, res) {
        //TODO auth user to event
        var pid = req.params.pid;

        models.participants.findOne({ '_id': pid }, function (erp, p) {
            if (p != null) {
                //check if user allowed to delete
                models.participants.remove({ '_id': pid }, function (err) {
                    if (err) {
                        res.send({ status: 'error', message: err });
                    }
                    else {
                        models.events.findOne({ _id: p.eventId }, function (ere, ev) {
                            ev.participantCount = ev.participantCount - 1;
                            ev.save();
                            io.sockets.in(p.eventId + '-reg').emit('regchange', {action: 'delete', data: pid});
                            res.send({ status: 'success' });
                        });
                    }
                });
            } else {
                res.send({ status: 'error', message: 'Driver not found.' });
            }

        });
    });

    // add participant to event
    app.post('/api/participants/:eventid', authorize(['Club Admin','Event Admin','Time Keeper','Registrar']), function (req, res) {
        var data = req.body
            , isDataValid = true
            , invalidMsg = '';
        //TODO auth user to event
        var eventid = req.params.eventid;

        var rg = data.rungroup
            , axclass = data.axclass
            , participantId = data.partId
            , isEdit = participantId.length > 0
            , memberId = data.memberId
            , paxClass = data.paxClass
            , carnum = data.carnum
            , driverFullname = data.name
            , driverFirstName = data.fname 
            , driverLastName = data.lname
            , checkin = data.checkin == 'yep'
            , isMember = data.memberNumber.length > 0
            , clubMemberId = data.memberNumber
            , car = { description: data.caryear + ' ' + data.carmake + ' ' + data.carmodel, make: data.carmake, model: data.carmodel, year: data.caryear, color: data.carcolor }
            , applyToExistsingRuns = data.applyToExistsingRuns == 'true'
            , email = data.email
            , isRookie = data.isRookie == 'true'
            ;


        // validate data
        if (carnum === undefined || carnum == null || carnum.replace(' ','').length == 0){
            isDataValid = false;
            invalidMsg += 'No Car Number provided. ';
        }
        if (driverFullname === undefined || driverFullname == null || driverFullname.replace(' ','').length == 0){
            isDataValid = false;
            invalidMsg += 'Driver Name is required.'
        }

        if (!isDataValid) {
            res.send({ status: 'failed', item: null, message: invalidMsg });
        }
        else {
        // validate event exists
            models.events.findById(eventid, function (err, event) {
                if (event != null) {

                    var rungroup = {name:rg || '', color:rg || '', label:''}
                    for (var i = 0; i < event.runGroups.length; i++) {
                        if (event.runGroups[i].name == rg){
                            rungroup.color = event.runGroups[i].color;
                            rungroup.label = event.runGroups[i].label;
                            break;
                        }   
                    };
                    models.clubs.findById(event.club.id, function(er,club){

                        //get season.classes for index
                        models.seasons.findOne({ clubId: event.club.id, seasonYear: event.season }, function (er1, season) {
                            var classExists = false, cls = null, pcls = null;
                            for (var i = 0; i < season.classes.length; i++) {
                                if (season.classes[i].name.toLowerCase() == axclass.toLowerCase()) {
                                    cls = season.classes[i];
                                    classExists = true;
                                    //console.log(cls);
                                    break;
                                }
                            }
                            if (paxClass.length != 0)
                            {
                                for (var i=0;i<season.paxClasses.length;i++){
                                    if (season.paxClasses[i].name.toLowerCase() == paxClass.toLowerCase()){
                                        pcls = season.paxClasses[i];
                                        cls.paxClass = pcls.name;
                                        break;
                                    }
                                }
                            }
                            //models.clubClasses.findOne({ 'name': axclass }, function (err, cls) {
                                if (cls != null) {

                                    function eventAndMemberNumClassCheck(cb){

                                        var dupEventCheck = { 'driver.carNumber': data.carnum, 'eventId': eventid }
                                        if (event.uniqueNumberPerClass) {
                                            if (pcls != null){
                                                dupEventCheck['axClass.paxClass'] = pcls.name;
                                            } else {
                                                dupEventCheck['axClass.name'] = cls.name;
                                            }
                                        }

                                        if (isEdit){
                                            dupEventCheck['_id'] = {$ne: participantId}
                                        }

                                        //TODO when editing use partId else use member id... what happens when a 
                                        //member registers twice?

                                        // first check event for dup
                                        models.participants.find(dupEventCheck)
                                            //.where('memberId').ne(memberId == '' ? '50bf7f12fc71b74f3b000001' : memberId)
                                            .exec(function (nerr, dparts) {
                                                if (nerr) {
                                                	console.log('ERROR dupEventCheck: ' + nerr);
                                                }
                                                if (dparts.length == 0) {
                                                    // now check for member dedicated/reserved num/class
                                                    var memberNumCheck = {dedicatedNumber:data.carnum};
                                                    if (club.uniqueNumberPerClass){
                                                        if (pcls != null){
                                                            memberNumCheck.lastPaxClass = pcls.name;
                                                        } else {
                                                            memberNumCheck.lastAxClass = cls.name;
                                                            memberNumCheck.lastPaxClass = '';
                                                        }
                                                    }
                                                    models.members.find(memberNumCheck)
                                                        .where('_id').ne(memberId == '' ? '50bf7f12fc71b74f3b000001' : memberId).exec(function (er,dmems){
                                                            if (dmems.length == 0){
                                                                cb();
                                                            } else {
                                                                //oops, we found a member with the dedicated #/class
                                                                var msg = 'Your club has dedicated car # and classes.  '
                                                                    +  dmems[0].firstName + ' ' + dmems[0].lastName 
                                                                    + ' has a dedicated # / class ('
                                                                    + (pcls != null ? (pcls.name + '-') : '') + cls.name + ' #' + data.carnum + ') that conflicts with what you have entered.';
                                                                cb(msg);
                                                            }
                                                        });
                                                }
                                                else {

                                                    var msg = dparts[0].driver.name + ' is already registered for this event with #' + data.carnum + '.';
                                                    if (event.uniqueNumberPerClass){
                                                    	msg = dparts[0].driver.name + ' is already registered for this event with ' 
                                                        + (pcls != null ? (pcls.name + '-') :'') + cls.name + ' #' + data.carnum + '.';
                                                    }
                                                    //oops, we got a dup
                                                    cb(msg);
                                                }
                                        });
                                    }

                                    function updateExistingRuns(p, callback){
                                        models.runs.find({participantId: p._id.toString()}, function(er, eruns){
                                            function saverun(){
                                                var run = eruns.shift();
                                                if (run){
                                                    run.driver.name = driverFullname;
                                                    run.driver.carNumber = data.carnum;
                                                    run.axClass = cls;
                                                    run.driver.car = car;

                                                    run.save(function(er){
                                                        saverun();
                                                    });
                                                } else {
                                                    engine.recalcEvent(eventid, function(er, lb){
                                                        console.log('update existing runs complete')
                                                    });
                                                }
                                            }

                                            saverun();
                                            
                                            
                                        })
                                    }

                                    function savep(p, mem) {
                                        
                                        p.eventId = eventid;
                                        p.club = event.club;
                                        p.runGroup = rungroup
                                        p.driver.name = driverFullname;
                                        p.driver.firstName = driverFirstName;
                                        p.driver.lastName = driverLastName;
                                        p.driver.car = car;
                                        p.driver.currentEmail = email;
                                        if (pcls != null)
                                            cls.name = pcls.name + '-' + cls.name;
                                        p.axClass = cls;
                                        p.driver.carNumber = data.carnum;
                                        p.driver.clubMemberId = clubMemberId;
                                        p.workerRole = data.role;
                                        p.paid = data.paid == 'yep';
                                        p.checkedIn = checkin;
                                        p.isRookie = isRookie;
                                        p.save(function (err) {
                                            if (err) { res.send({ status: 'error', message: 'Failed to save participant record' }); }
                                            else {
                                                if (!isEdit){
                                                    event.participantCount = event.participantCount + 1;
                                                    event.save();
                                                } 

                                                //TODO implement this out better
                                                if (applyToExistsingRuns)
                                                    updateExistingRuns(p);

                                                if (mem === undefined)
                                                    mem = null;
                                                p.id = p._id.toString();
                                                
                                                io.sockets.in(eventid + '-reg').emit('regchange', {action: isEdit ? 'update':'add', data: p, member:mem});
                                                if (event.uploadResults){
                                                    engine.registrationUpdate(eventid, p, !isEdit);    
                                                }
                                                
                                                res.send({ status: 'success', item: p });
                                            }
                                        });
                                    }
                                    
                                    function savem(member, part){
                                    
                                        var memSave = true;

                                        //TODO dedicated class / # ???
                                        if (isMember){
                                            member.clubMemberId = clubMemberId;
                                            member.lastAxClass = cls.name;
                                            member.lastPaxClass = pcls != null ? pcls.name : '';
                                            member.dedicatedNumber = carnum;
                                        } else {
                                            member.lastAxClass = '';
                                            member.lastPaxClass = '';
                                            member.dedicatedNumber = '';
                                            member.clubMemberId = '';
                                        }
                                        // check if member # 
                                        if (member.clubMemberId != clubMemberId){
                                            member.clubMemberId = clubMemberId;
                                            memSave = true;
                                        }

                                        // check for new email
                                        if (member.currentEmail != email && member.currentEmail.length > 0) {
                                            member.emails.push({address:member.currentEmail.toString()});
                                            member.currentEmail = email;
                                            memSave = true;
                                        } else if (member.currentEmail != email){
                                            member.currentEmail = email;
                                            memSave = true;
                                        }

                                        //check for new car
                                        var carexists = false;
                                        for (var cc in member.cars){
                                            if (member.cars[cc].make == car.make && member.cars[cc].model == car.model
                                                && member.cars[cc].color==car.color && (member.cars[cc].year != null && member.cars[cc].year.toString() == car.year.toString()))
                                            {
                                                carexists = true;
                                                break;
                                            }
                                        }
                                        if (!carexists)
                                        {
                                            member.cars.push(car);
                                            memSave = true;
                                        }

                                        if (memSave){
                                            member.save(function(er){
                                                if (part !== undefined){
                                                    savep(part, member);
                                                } else {
                                                    var npart = new models.participants();
                                                    npart.memberId = data.memberId;
                                                    savep(npart, member);
                                                }
                                            })
                                        }
                                        else {
                                            if (part !== undefined){
                                                savep(part, member);
                                            } else {
                                                var npart = new models.participants();
                                                npart.memberId = data.memberId;
                                                savep(npart, member);
                                            }
                                        }
                                    }

                                    if (isEdit) {
                                        models.participants.findById(participantId, function (erp, part) {
                                            if (er) {console.log('ERROR getting part: ' + erp);}
                                            else {
                                                eventAndMemberNumClassCheck(function(dupMsg){
                                                    if (!dupMsg){
                                                        
                                                        models.members.findById(data.memberId, function(er,member){
                                                            console.log('looking up member by id')
                                                            if (er) {
                                                                console.log('member lookup error');
                                                                res.send({status:'error', message:er.message});
                                                            }
                                                            else if (!member){
                                                                res.send({status:'error',message:'Invalid member.'})
                                                            }
                                                            else {
                                                                savem(member, part);
                                                            }
                                                        });

                                                    }
                                                    else {
                                                        res.send({status:'error', message:dupMsg});
                                                    }

                                                });                             
                                            }
                                            
                                        });
                                    } else {
                                        // dup and dedicated num/class check
                                        eventAndMemberNumClassCheck(function(dupMsg){
                                            if (!dupMsg) {

                                                // check if we need to add member
                                                if (data.memberId == ''){
                                                    var member = new models.members();
                                                    member.firstName = driverFirstName; //data.name.replace('  ',' ').split(' ')[0];
                                                    member.lastName = driverLastName; //data.name.replace('  ',' ').split(' ')[1];
                                                    member.club = {name:event.club.name, id:event.club.id}
                                                    member.cars = [car];
                                                    member.isMember = isMember;
                                                    member.currentEmail = email;
                                                    if (isMember){
                                                    	member.clubMemberId = clubMemberId;
                                                    	member.lastAxClass = cls.name;
	                                                    member.lastPaxClass = pcls != null ? pcls.name : '';
	                                                    member.dedicatedNumber = carnum;
                                                    } else {
                                                    	member.lastAxClass = '';
	                                                    member.lastPaxClass = '';
	                                                    member.dedicatedNumber = '';
	                                                    member.clubMemberId = '';
                                                    }
                                                    
                                                    member.clubRegion = '';
                                                    member.save(function(er){
                                                        var part = new models.participants();
                                                        part.memberId = member._id;
                                                        savep(part, member);
                                                    });

                                                }
                                                else {
                                                    models.members.findById(data.memberId, function(er,member){
                                                        console.log('looking up member by id')
                                                        if (er) {
                                                            console.log('member lookup error');
                                                            res.send({status:'error', message:er.message});
                                                        }
                                                        else if (!member){
                                                            res.send({status:'error',message:'Invalid member.'})
                                                        }
                                                        else {
                                                            savem(member);
                                                        }
                                                    });
                                                    
                                                }
                                            }
                                            else {
                                                res.send({ status: 'error', message: dupMsg });
                                            }
                                                
                                        }); //eventAndMemberNumClassCheck lookup
                                    }
                                } else {
                                    res.send({ status: 'error', message: 'Invalid class' });
                                }
                            //});
                        });
                    });
                } else {
                    res.send({ status: 'error', message: 'Invalid event' });
                }
            });
        } // isDataValid

    });


    //
    // RUNS DATA
    //



    app.get('/api/driverinfo/:eventid', function (req, res) {
        var eid = req.params.eventid
            , carNumber = req.query['carnum']
            , axClass = req.query['axclass']
            , participantId = req.query['participantId'];

        //TODO authorize
        var find = null;
        if (participantId != null){
            find = {_id:participantId}
        } else {
            find = { eventId:eid, 'axClass.name':axClass, 'driver.carNumber':carNumber }
        }
        // get participant info
        models.participants.findOne(find, function (er, part) {
            if (er) res.send({ status: 'error', message: 'Error getting participant. ' + er });
            else {
                if (part) {
                    //get runs
                    models.runs.find({ eventId: part.eventId, participantId:part._id, status:'F' }, function (er, runs) {
                        if (er) res.send({ status: 'error', message: 'Invalid runs.' });
                        else {
                            models.members.findById(part.memberId, function(er, member){
                                if (er) res.send({ status: 'error', message: 'Invalid member.' });
                                else 
                                    res.send({ status: 'success', participant: part, runs: runs, member:member });
                            }) 
                        }     
                    });
                }
                else {
                    res.send({ status: 'error', message: 'Invalid participant.' });
                }
            }
        });
    });
    app.get('/api/driver/:pid', function (req, res) {
        var pid = req.params.pid;

        //TODO authorize

        // get participant info
        models.participants.findOne({ _id: pid }, function (err, part) {
            if (part) {
                //get runs
                models.runs.find({ eventId: part.eventId, participantId:pid }).sort({runNumber:-1}).exec(function (er, runs) {
                    res.send({ status: 'success', participant: part, runs: runs });
                });
            }
            else {
                res.send({ status: 'error', message: 'Invalid car number' });
            }
        });
    });


    ////add run to an event
    //app.post('/api/runs/:clubname/:eventnumber', function (req, res) {
    //    var club = req.params.clubname
    //        , eventNum = req.params.eventnumber;


    //    var rr = models.runs.find({ eventId: 1 }).sort({ runNumber: -1 }).limit(1).exec(function (err, rr) {
    //        var runNumber = 0;
    //        if (rr.length > 0) {
    //            runNumber = rr[0].runNumber;
    //        }
    //        //runNumber= runNumber + 1;
    //        runNumber++;
    //        console.log('Run #' + runNumber);

    //        var item = req.body.item;
    //        //console.log(item);

    //        //get max run number
    //        var r = new models.runs();
    //        r.runNumber = runNumber;
    //        r.eventId = 1;
    //        r.clubId = 1;
    //        r.driver.name = item.drivername;
    //        r.driver.id = 0;
    //        r.car.description = '911 S';
    //        r.car.year = 2010;
    //        r.car.color = 'black';
    //        r.axClass = 'AX07';
    //        r.carNumber = item.carnumber;
    //        r.isCompleted = item.iscompleted == 'true';
    //        r.rawTime = 0;
    //        r.cones = 0;

    //        r.save(function savedRun(err) {
    //            if (err) { res.json(err); }
    //            else { res.send(r); }
    //        });
    //        //console.log(r);


    //    });
    //});

    ////update run - ie, enter time
    //app.put('/api/runs/:clubname/:eventnumber', function (req, res) {

    //});


    //workercheckin

    app.delete('/api/workercheckin/:eventid/:checkinid', authorize(['Club Admin','Event Admin','Registrar','Worker Checkin']), function (req, res) {
        //TODO authorize
        var eid = req.params.eventid
            , cid = req.params.checkinid;

        models.events.findOne({ _id: eid }, function (ere, ev) {
            if (ere) {
                res.send({ status: 'error', message: 'Event: ' + ere.toString() });
            }
            else {
                var found = false;
                for (var i = 0; i < ev.stations.length; i++) {
                    for (var j = 0; j < ev.stations[i].checkins.length; j++) {
                        if (ev.stations[i].checkins[j]._id == cid) {
                            ev.stations[i].checkins[j].remove();
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }

                if (found) ev.save(function (er) {
                    if (er) { res.send({ status: 'error', message: er.toString() }); }
                    else { res.send({ status: 'success' }); }
                });

            }
        });
    });


    //new worker checkin
    app.post('/api/workercheckin/:eventid', authorize(['Club Admin','Event Admin','Time Keeper','Worker Checkin','Registrar']), function (req, res) {
        var eid = req.params.eventid
            , runGroup = req.body.runGroup
            , session = req.body.session
            , station = req.body.station
            , partId = req.body.pid
        ;

        //TODO authorize


        models.events.findOne({ _id: eid }, function (ere, ev) {
            if (ere) {
                res.send({ status: 'error', message: 'Event: ' + ere.toString() });
            }
            else {
                var valid = false;
                models.participants.findOne({ _id: partId }, function (erp, part) {
                    var kid = null;
                    if (erp) { res.send({ status: 'error', message: 'Participant: ' + erp.toString() }); }
                    else {
                        var exists = false;
                        //check existence first
                        for (var i = 0; i < ev.stations.length; i++) {
                            for (var b = 0; b < ev.stations[i].checkins.length; b++) {
                                var c = ev.stations[i].checkins[b];
                                if (c.name == part.driver.name && c.session == parseInt(session) && c.runGroup == runGroup) {
                                    exists = true;
                                }

                            }
                        }
                        if (!exists) {
                            for (var i = 0; i < ev.stations.length; i++) {
                                if (ev.stations[i].name == station) {
                                    ev.stations[i].checkins.push({ runGroup: runGroup, name: part.driver.name, session: session });
                                    var cid = ev.stations[i].checkins.length;
                                    kid = ev.stations[i].checkins[cid - 1]._id;

                                    valid = true;

                                }
                            }
                            if (valid) {
                                ev.save(function (er2) {
                                    if (er2) { res.send({ status: 'error', message: 'Station: ' + er2.toString() }); }
                                    else {
                                        res.send({ status: 'success', item: { _id: kid, runGroup: runGroup, name: part.driver.name, session: session } });
                                    }
                                });
                            } else {
                                res.send({ status: 'error', message: 'Station not found.' });
                            }
                        }
                        else {
                            res.send({ status: 'error', message: 'Driver is already checked in' });
                        }

                    }
                });
            }
        });


    });



    app.delete('/api/season/:year', authorize(['Club Admin']), function(req,res){
        // var year = req.params.year;
        // var result = {success: false, message: ''}
        // if (year)
        // models.events.count({seasonYear})
        res.send({success: false, message: 'Not implemented.'});
    });



    //INITIALIZE
    app.get('/api/initclasses/:clubname', authorize(['Club Admin']), function (req, res) {
        var clubname = decodeURIComponent(req.params.clubname);


        models.clubClasses.count({ 'club.name': clubname }, function (err, c) {
            var status = 'success';
            if (err) {
                stats = 'error';
            }
            if (c == 0) {
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "914GT", "description": "914GT", "index": 1.0000 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX01", "description": "AX01", "index": 1.0000 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX02", "description": "AX02", "index": 1.0000 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX03", "description": "AX03", "index": 1.0000 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX03L", "description": "AX03L", "index": 0.9600 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX04", "description": "AX04", "index": 0.9930 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX05", "description": "AX05", "index": 0.9860 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX05L", "description": "AX05L", "index": 0.9470 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX06", "description": "AX06", "index": 0.9780 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX06L", "description": "AX06L", "index": 0.9390 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX07", "description": "AX07", "index": 0.9700 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX07L", "description": "AX07L", "index": 0.9310 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX08", "description": "AX08", "index": 0.9620 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX08L", "description": "AX08L", "index": 0.9240 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX09", "description": "AX09", "index": 0.9540 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX09L", "description": "AX09L", "index": 0.9160 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX10", "description": "AX10", "index": 0.9460 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX10L", "description": "AX10L", "index": 0.9080 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX11", "description": "AX11", "index": 0.9380 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX11L", "description": "AX11L", "index": 0.9000 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX12", "description": "AX12", "index": 0.9280 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX12L", "description": "AX12L", "index": 0.8900 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX13", "description": "AX13", "index": 0.9170 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX14", "description": "AX14", "index": 0.9060 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX14L", "description": "AX14L", "index": 0.8690 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX15", "description": "AX15", "index": 0.8940 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX15L", "description": "AX15L", "index": 0.8580 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "AX16", "description": "AX16", "index": 0.8830 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "AX16L", "description": "AX16L", "index": 0.8470 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "FUN", "description": "FUN", "index": 1.0000 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS01", "description": "SS01", "index": 0.9170 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "SS01L", "description": "SS01L", "index": 0.8810 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS02", "description": "SS02", "index": 0.9170 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "SS02L", "description": "SS02L", "index": 0.8810 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS03", "description": "SS03", "index": 0.9170 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "SS03L", "description": "SS03L", "index": 0.8810 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS04", "description": "SS04", "index": 0.9380 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS05", "description": "SS05", "index": 0.9380 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS06", "description": "SS06", "index": 0.9540 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS07", "description": "SS07", "index": 0.9280 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS08", "description": "SS08", "index": 0.9460 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": true, "name": "SS08L", "description": "SS08L", "index": 0.9380 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS09", "description": "SS09", "index": 0.9700 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS10", "description": "SS10", "index": 0.9700 }).save();
                new models.clubClasses({ "club": { "name": clubname }, "isLadies": false, "name": "SS12", "description": "SS12", "index": 0.9700 }).save();
            }
            res.send({ status: status, count: c });
        });
        //models.participants.find({ 'club.name': clubname }, 'driver car',{group:'driver'},function (err, drivers) {
        //    res.send({ status: 'success', items: drivers });
        //});
    });

}


function date1(dt, f) {
    var d = new Date(dt);
    var m_names = new Array("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December");
    var curr_date = d.getDate();
    var curr_month = d.getMonth();
    var curr_year = d.getFullYear();
    if (f) {
        return m_names[curr_month] + ' ' + curr_date + ', ' + curr_year;
    } else {
        return (curr_month + 1) + '/' + curr_date + '/' + curr_year;
    }
}

function date2(dt) {
    var d = new Date(dt);

    var curr_date = d.getDate();
    if (curr_date < 10) { curr_date = '0' + curr_date; }
    var curr_month = d.getMonth();
    var curr_year = d.getFullYear();

    return curr_year + '-' + (curr_month + 1) + '-' + curr_date;

}