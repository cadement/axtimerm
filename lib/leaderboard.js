
var models = null;

//TODO create constructor to handle models

// module.exports = function(models){}


function recalcEvent(_models, eventId, callback){
	console.log('LEADERBOARD: recalcEvent started');

	models = _models;
	models.events.findById(eventId, function(er, tevent){
		if (er || !tevent) {
			callback('Event not found or error: ' + er);
		}
		else {
			models.participants.find({eventId: eventId}, function(er, participants){
				if (er || participants.length == 0) { callback('No participants or error ' + er);}
				else {
					models.seasons.findOne({'clubId':tevent.club.id, seasonYear:tevent.season}, function(er, season){
						if (er || !season) { callback('No season setup or error: ' + er);}
						else {
							leaderboardRecalcEvent(tevent, participants, season, callback);
						}
					});
				}
			});
		}
			
	});
}
function leaderboardRecalcEvent(tevent, parts, season, callback) {
    var prevEvent = null
        , allow = true
        , leaderBoard = []
        , start = new Date().getTime()
        ;
    console.log('starting event leaderboard recalc');

    function lbrecord(){
        return { driver: '', total: 0, totalwDrops:0
            , memberId:'', axClass: ''
            , rank: 0, points: []
            , priorRank: 0
            , priorTotal: 0
            , rankDiff:0 
            , board: ''
            , eventCount:1 }
    }

    //get previous event
    if (tevent.countForPoints){
        if (tevent.eventNumber > 1){
            console.log('looking for prior event');
            models.events.findOne({'club.id':tevent.club.id, eventNumber: tevent.eventNumber-1, countForPoints:true}, function(er, pevt){
                if (pevt && !er){
                    prevEvent = pevt;
                    console.log('prior found: ' + pevt.name);
                }
                doit();
            })
        }
        else 
            doit();
    }
    else {
        callback('Does not count for points, skipping');
    }
        
    function doit(){
        console.log('doing it');
        var newLeaderboard = [];
        var currentEventNumber = tevent.eventNumber;
        console.log('evnt #: ' + currentEventNumber);
        // sum up new totals
        function dototal(lb){
            var total = 0, totalwdrops = 0;
            var lbr = lb;
            var pts = lbr.points.slice(0);
            pts.sort(function(a,b){
                return a == b ? 0 : a > b ? -1 : 1;
            });
            for (var n=0;n<pts.length;n++){
                if (lbr.board == 'PAX'){
                    if (n < season.paxMaxEvents || season.paxMaxEvents ==0){
                        totalwdrops += pts[n];
                    }
                }
                if (lbr.board == 'CLASS'){
                    if (n < season.classMaxEvents || season.classMaxEvents == 0){
                        totalwdrops += pts[n];
                    }
                }
                total += pts[n];
            }
            lbr.totalwDrops = totalwdrops;
            lbr.total = total;
            return lbr;
        }

        // get previous event data
        if (prevEvent != null){
            leaderBoard = prevEvent.leaderBoard.slice(0);
            // set new prior rank
            for (var n=0;n<leaderBoard.length;n++){
                leaderBoard[n].priorRank = leaderBoard[n].rank;
                leaderBoard[n].priorTotal = leaderBoard[n].totalwDrops;
            }
            //console.log(leaderBoard);
        }
        console.log('lb.len: ' + leaderBoard.length);
        for (var pix=0;pix<parts.length;pix++){
            // check if record exists in lb
            var p = parts[pix];
            var exists = false;
            //var classlb = null;
            //var paxlb = null; 
            var paxExists = false;
            var classExists = false;
            //console.log('p.memberId = ' + p.memberId);
            //TODO could consolidate 2 fors into 1

            //find existing pax and update 
            for (var lbix=0;lbix<leaderBoard.length;lbix++){
                if (leaderBoard[lbix].memberId.toString() == p.memberId.toString() && leaderBoard[lbix].board == 'PAX'){

                    var paxlb = leaderBoard[lbix];
                   // console.log(paxlb.memberId);
                    //console.log('found prior pax lb: ' + paxlb.points.join(','));
                    paxExists = true;
                    //console.log('pts.len:' + paxlb.points.length);
                    //console.log('cen:' + currentEventNumber);
                    for (var pre = leaderBoard[lbix].points.length;pre<currentEventNumber-1;pre++){
                        leaderBoard[lbix].points.push(0);
                    }
                    leaderBoard[lbix].points.push(p.paxPoints);
                    // increment ev count
                    leaderBoard[lbix].eventCount = leaderBoard[lbix].eventCount + 1;
                    leaderBoard[lbix] = dototal(leaderBoard[lbix]);
                    break;
                }
            }
            //find existing class and update
            for (var lbix=0;lbix<leaderBoard.length;lbix++){
                if (leaderBoard[lbix].memberId == p.memberId 
                    && leaderBoard[lbix].board == 'CLASS'
                    && leaderBoard[lbix].axClass == p.axClass.name.split('-')[0]){
                    var classlb = leaderBoard[lbix];
                    //set missing points to 0

                    for (var pre = classlb.points.length;pre<currentEventNumber-1;pre++){
                        classlb.points.push(0);
                    }
                    classlb.points.push(p.classPoints);
                    // increment ev count
                    classlb.eventCount = classlb.eventCount + 1;
                    leaderBoard[lbix] = dototal(classlb);
                    classExists = true;
                    break;
                }
            }

            //doesn't exist, create new record for class
            if (!classExists){
                if (p.axClass.name.toLowerCase().indexOf('fun') == -1)
                {
                    //console.log('CREATING NEW CLASS LB');
                    var classlb = new lbrecord();
                    classlb.driver = p.driver.name;
                    classlb.memberId = p.memberId;
                    var cls = p.axClass.name.split('-')[0];
                    classlb.axClass = cls;
                    classlb.board = 'CLASS';
                    // set prior points to 0
                    for (var pre = 1;pre<currentEventNumber;pre++){
                        classlb.points.push(0);
                    }
                    classlb.points.push(p.classPoints);
                    classlb = dototal(classlb);
                    leaderBoard.push(classlb);
                }
            }

            //doesn't exist, create new record for pax
            if (!paxExists){
                //console.log('CREATING NEW PAX LB');
                var paxlb = new lbrecord();
                paxlb.driver = p.driver.name;
                paxlb.memberId = p.memberId;
                paxlb.board = 'PAX';
                // set prior points to 0
                for (var pre = 1;pre<currentEventNumber;pre++){
                    paxlb.points.push(0);
                }
                paxlb.points.push(p.paxPoints);
                paxlb = dototal(paxlb);
                leaderBoard.push(paxlb);
            }
            

        } // for parts loop
        // go through and fill in missing points 
        for (var lb in leaderBoard){
            if (leaderBoard[lb].points.length < currentEventNumber){
                leaderBoard[lb].points.push(0);
            }
        }
        // determine new ranking for pax
        leaderBoard.sort(function(a,b){
            if (a.totalwDrops == b.totalwDrops) {
                if (a.eventCount == b.eventCount)
                    return 0;
                return a.eventCount < b.eventCount ? -1 : 1;
            }
            return a.totalwDrops > b.totalwDrops ? -1 : 1;
        });
        var classRank = 1, paxRank = 1;

        console.log('doing pax rank');
        for (var ix=0;ix<leaderBoard.length;ix++){
            if (leaderBoard[ix].totalwDrops > 0 && leaderBoard[ix].board == 'PAX')
            {
                //console.log(leaderBoard[ix].driver);
                leaderBoard[ix].rank = paxRank;
                paxRank++;
                leaderBoard[ix].rankDiff = (leaderBoard[ix].priorRank > 0 ? (leaderBoard[ix].priorRank - leaderBoard[ix].rank) : 0);
            }
        }
        //determine class ranking
        var cls = '';
        leaderBoard.sort(function(a,b){
            if (a.axClass == b.axClass)
            {
                if (a.totalwDrops == b.totalwDrops)
                    return a.eventCount < b.eventCount ? -1 : 1;
                else 
                    return a.totalwDrops < b.totalwDrops ? 1 : -1;
            }
            return a.axClass < b.axClass ? -1 : 1;
            
        })
        for (var ix=0;ix<leaderBoard.length;ix++){
            if (leaderBoard[ix].totalwDrops > 0 && leaderBoard[ix].board == 'CLASS')
            {
                if (cls != leaderBoard[ix].axClass){
                    cls = leaderBoard[ix].axClass;
                    classRank = 1;
                }
                leaderBoard[ix].rank = classRank;
                classRank++;
                leaderBoard[ix].rankDiff = (leaderBoard[ix].priorRank > 0 ? (leaderBoard[ix].priorRank - leaderBoard[ix].rank) : 0);
            }
        }


        tevent.leaderBoard = leaderBoard;
        tevent.save(function(er){
            //console.log('saved leaderboard; ' + er);
            var duration = new Date().getTime() - start;
            console.log('leaderboard done in ' + duration + 'ms');
            callback(null, leaderBoard);
        });
    } // fx doit
}

function leaderboardRecalcSeason(_models, club, seasonYear, callback){
	models = _models;
    var _events = null
        , eventsToDoList = null
        , season = null
        , start = new Date().getTime()
        ;

    models.events.find({'club.id':club._id, season:seasonYear, countForPoints:true}).sort({dateInt:1}).exec(function(er, evts){
        if (er) callback('events lookup failed: ' + er);
        else {
            models.seasons.findOne({clubId:club._id, seasonYear:seasonYear}, function(er, ssn){
                if (er) callback('No season setup for ' + seasonYear + '.  You must setup the season first.');
                else {
                    season = ssn;
                    eventsToDoList = evts;
                    doevents();
                }
            })
        }
    });

    function doevents(){
        var evt = eventsToDoList.shift();
        if (evt === undefined){
            console.log('done recalcing season.');
            callback();
        }
        else {
            models.participants.find({eventId:evt._id}, function (er, parts){
                if (er){callback('Participant lookup failed: ' + er);}
                else {
                    leaderboardRecalcEvent(evt, parts, season, function (er, lb){
                        if (er) {
                            console.log('Error recalcing leaderboard for ' + evt.name + '.  Stopping process.');
                        } else {
                            doevents();
                        }
                    })
                }
            })
        }
    }
}

//export api
module.exports.calcEvent = recalcEvent;
module.exports.calcSeason = leaderboardRecalcSeason;

