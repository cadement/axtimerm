
var fs = require('fs');
require('date-utils');

module.exports = function (models,io, callback) {
    var data = null, cont = true;
    var engine = require('./engine')({models:models, io:io})
    var yr = Date.today().getFullYear()
        , club = null
        , season = null
        , eventCount = 0;

    function finish(msg){
        callback(msg);
    }
    try {
        var s = fs.readFileSync('dummydata.json');
        data = JSON.parse(s.toString());
    }
    catch (er){
        cont = false;
        finish('No dummy data file');
    }
    function addSeason() {
        console.log('do season add');
        var pxcls = [];
        for (var n = 0; n < data.paxClasses.length; n++) {
            pxcls.push({name:data.paxClasses[n], isLadies:false, isStock:false, description:data.paxClasses[n], category:'Competitive Rollup'})
        };
        season = new models.seasons();
        season.clubId = club._id.toString();
        season.seasonYear = yr;
        season.paxMaxEvents = 3;
        season.classMaxEvents = 3;
        season.classPoints = [{position:1, points:20}, {position:2, points:16},{position:3, points:13},{position:4, points:11},{position:5, points:9},{position:6, points:7},{position:7, points:5},{position:8, points:3},{position:9, points:2},{position:10, points:1}];
        var paxpts = [], paxincr = 6, paxls = 106;
        for (var i=1;i<31;i++){
            paxls = paxls - paxincr
            paxpts.push({position:i, points:paxls});
            //if (i == 4) paxincr = 6;
             if (i ==4) paxincr = 5;
            else if (i ==6) paxincr = 4;
            else if (i ==16) paxincr = 3;
            else if (i ==20) paxincr = 2;
            else if (i==29) paxincr = 1;

        }
        season.paxPoints = paxpts; //[{position:1, points:100}, {position:2, points:97},{position:3, points:94},{position:4, points:91},{position:5, points:88},{position:6, points:85}];
        season.classes = data.classes.slice(0);
        season.paxClasses = pxcls;
        season.conePenalty = 2;
        season.save(function (er) {
            if (er) {  finish('error saving season: ' + er) }
            else { doMembers(); }
        });
    }
    
    function findcls(n){
        var clss = data.classes.slice(0);
        //console.log('find class: "' + n + '", len: ' + clss.length);
        for (var a = 0; a < clss.length; a++) {
            var r = clss[a];
            //console.log('\t matching: ' + r.name);
            if (r.name == n)
                return r;
        };
        return null;
    }

    var evnum = 1
        , carnum = 1001;

    var runGroups = [{ name: 'Red', color: 'red', label:'1' },{ name: 'Green', color: 'green', label:'2' },{ name: 'Blue', color: 'blue', label:'3' }];

    function getRunGroup(name){
        for (var i = runGroups.length - 1; i >= 0; i--) {
            if (runGroups[i].name == name){
                return runGroups[i];
            }
        };
    }

    function doEvents(){
        models.events.remove({}).exec(function(er){
        models.participants.remove({}).exec(function(er){
        models.runs.remove({}).exec(function(er){

            eventCount = data.events.length;

            function addevent(){
                var evt = data.events.shift();


                if (evt !== undefined){
                    var dt = Date.today().addDays(evnum - eventCount);

                    console.log('adding event...' + evnum);
                    console.log('\t ' + dt.toFormat('MM/DD/YYYY'));
                    var ev = new models.events();
                    ev.name = yr + ' ' + club.shortName + ' #' + (evnum < 10 ? '0' + evnum : evnum);
                    //ev.stations = ns;
                    //console.log(evt.date);
                    ev.dateInt = dt.toFormat('YYYYMMDD');
                    ev.countForPoints = true;
                    ev.sessions = 1;
                    //ev.name = name;
                    ev.club = { name: club.name, id: club._id };

                    ev.date = dt.toFormat('MM/DD/YYYY');
                    ev.season = yr;
                    ev.eventNumber = evnum;
                    ev.location = evt.location;
                    ev.currentRunGroup = {name:'none', color:'', label:''};
                    var stations = [];
                    for (var i = 0; i < models.stations.length; i++) {
                        stations.push({name: models.stations[i], assigned:[], checkins:[]});
                    };

                    ev.stations = stations;
                    ev.workerRoles = [];
                    ev.workerRoles.push({role:'Time Keeper', password:'password'})
                    ev.workerRoles.push({role:'Cone Counter', password:'password'})
                    ev.workerRoles.push({role:'Car Queuer', password:'password'})
                    ev.workerRoles.push({role:'Worker Checkin', password:'password'})
                    ev.runGroups = runGroups;
                    ev.uploadResults = false;
                    ev.save(function(er){
                        evnum++;

                        function doRuns(){
                            console.log('adding runs: ' + evt.runs.length);
                            models.participants.find({eventId:ev._id.toString()}, function(er, parts){
                                var runnum = 1;
                                var partix = 0;
                                function addrun(){
                                    var rn = evt.runs.shift();
                                    if (rn !== undefined){
                                        var r = new models.runs();
                                        if (rn.penalty != 'rerun') {
                                            parts[partix].totalRuns++;
                                        }
                                        r.driverRunNumber = parts[partix].totalRuns;

                                        r.runNumber = runnum;
                                        r.memberId = parts[partix].memberId;
                                        r.participantId = parts[partix]._id.toString();
                                        r.eventId = ev._id;
                                        r.club = ev.club;
                                        //part.driver.memberId = part.memberId;
                                        r.driver = parts[partix].driver;
                                        r.session = 1;
                                        r.axClass = parts[partix].axClass;
                                        r.isCompleted = true;
                                        r.status = 'F';
                                        r.rawTime = rn.time;
                                        r.cones = rn.cones;
                                        r.totalTime = rn.time + (ev.conePenalty * rn.cones);
                                        r.paxTime = Math.floor(r.totalTime * parts[partix].axClass.index * 1000) / 1000;

                                        r.isDnf = rn.penalty == 'dnf';
                                        r.isOff = false;
                                        r.getsRerun = rn.penalty == 'rerun';

                                        r.runGroup = parts[partix].runGroup;
                                        r.save(function (er) {
                                            runnum++;
                                            partix++;
                                            if (partix == parts.length){
                                                partix = 0;
                                            }
                                            addrun();
                                        });
                                    }
                                    else {
                                        console.log('recalc Event');
                                        engine.recalcEvent(ev._id.toString(), function(er){
                                            addevent();
                                        });
                                    }
                                    
                                }
                                addrun();
                            });
                        }


                        models.members.find({}, function(er, members){
                            var pcnt = 0;
                            console.log('memb count: ' + members.length);
                            var partCount = evt.participants.length;
                            console.log('part count: ' + evt.participants.length);

                            function doit(){
                                var ep = evt.participants.shift();
                                if (ep !== undefined){
                                    console.log('adding part: ' + ep.memberId);
                                    var tClass = findcls(ep.axclass);
                                    if (tClass == null){
                                        console.log('no class : ' + ep.axclass);
                                    }
                                    var clsname = tClass.name;
                                    if (ep.paxclass != ''){
                                        
                                        clsname = ep.paxclass + '-' + ep.axclass;
                                    }
                                    var p = new models.participants();
                                    p.eventId = ev._id.toString();
                                    p.club = {name:club.name, id:club.id};
                                    p.memberId = members[pcnt]._id;
                                    p.checkedIn = pcnt % 2 === 0;
                                    p.paid = pcnt > 8;
                                    p.isTechd = pcnt % 2.5 === 0;


                                    var rgName = ep.rungroup.charAt(0).toUpperCase() + ep.rungroup.slice(1);
                                    //p.runGroup = { name: ep.rungroup.charAt(0).toUpperCase() + ep.rungroup.slice(1), color: ep.rungroup };
                                    p.runGroup = getRunGroup(rgName);
                                    
                                    var car = {};
                                    for(var n in members[pcnt].cars[0]){
                                        car[n] = members[pcnt].cars[0][n];
                                    }
                                    var carnum = pcnt + 10;
                                    if (members[pcnt].dedicatedNumber.length > 0)
                                        carnum = members[pcnt].dedicatedNumber;
                                    p.driver = {
                                        name: members[pcnt].fullName
                                        , firstName: members[pcnt].firstName
                                        , lastName: members[pcnt].lastName
                                        , car:car
                                        , carNumber: carnum
                                        , clubMemberId: members[pcnt].clubMemberId
                                        , currentEmail: members[pcnt].currentEmail
                                    }
                                    p.axClass = {};

                                    for (var n in tClass){
                                        p.axClass[n] = tClass[n];
                                    }
                                    p.axClass.name = clsname;
                                    p.axClass.paxClass = ep.paxclass;
                                    p.isImported = true;
                                    p.workerRole = 'None';
                                    p.save(function(er){
                                        pcnt++;
                                        doit();
                                    })
                                }
                                else {
                                    doRuns();
                                }
                            }
                            doit();
                            
                        })
                       
                    });
                }
                else {
                    finish();
                }
            }
            addevent();
        });
        });
        });
    }

    function doMembers(){

        models.members.remove({}).exec(function(er){
            if (er) console.log('error deleting members: ' + er);
            add();
        })

        function add(){
            var m = data.members.shift();
            if (m !== undefined){
                var member = new models.members();
                member.club = {id:club._id, name:club.name}
                member.clubMemberId = m.clubMemberId;
                member.firstName = m.firstName;
                member.lastName = m.lastName;
                member.lastAxClass = m.lastAxClass;
                member.msrId = '';
                member.cars = m.cars;
                member.clubRegion = '';
                member.dedicatedNumber = m.dedicatedNumber;
                member.dateCreated = new Date();
                member.dateUpdated = new Date();
                member.addresses = [];
                member.emails = [];
                member.phones = [];
                member.sponsors = [];
                member.currentEmail = m.currentEmail;
                member.save(function(er){
                    console.log('saved member')
                    //callback(er, member);
                    if (er) { console.log('err saving member: ' + er);}
                    add();
                })

            } else {
                doEvents();
            }
        }
    }


    if (cont){
        models.clubs.find({}, function (er1, clubs) {
            if (clubs.length == 1) {
                club = clubs[0];
                //lookup if season exists already
                models.seasons.find({ clubId: club._id.toString(), seasonYear: yr }, function (er2, ss) {
                    if (ss.length == 1) {
                        ss[0].remove(function(er){
                            addSeason();
                        });
                    } 
                    else {
                        addSeason();
                    }
                });
            }
            else {
                finish('No club or too many clubs in the system.')
            }
        });
    }

}