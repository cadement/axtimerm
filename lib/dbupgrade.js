
var models = {};


function upgrade1(club, callback){
	var dbVersion = '1.0.1';
	var start = new Date().getTime();
	
    // v1 upgrade
    // update participant records with memberid and email
    var message = ''
    var membersToUpdate = 0
        , partsToUpdate = 0
        , emailsUpdated = 0
        , partsUpdated = 0;


    function finish(){
        club.dbVersion = dbVersion;
        club.save(function(er){
            console.log('emails: ' + emailsUpdated + ', parts: ' + partsUpdated)
            console.log('duration: ' + (new Date().getTime() - start) + 'ms')
           	callback(er);   
        })
        
    }

    models.participants.find({}, function(er, parts){
        if (er){message = 'ERROR: ' + er;finish();} 
        else {
            models.members.find({}, function(er,members){
                if (er) {message='ERROR: ' + er;finish();}
                else {
                    console.log('starting database upgrade.')
                    console.log('Total Members: ' + members.length);
                    console.log('Total Participants: ' + parts.length);

                    membersToUpdate = members.slice(0);
                    partsToUpdate = parts.slice(0);

                    function getMember(id){
                        for (var i = 0; i < members.length; i++) {
                            if (members[i]._id.toString() == id){
                                return members[i];
                            }
                        };
                        return null;
                    }
                    

                    // update members currentEmail 
                    var membersChecked = 0;
                    function domember(){
                        var m = membersToUpdate.shift();
                        if (m){
                            membersChecked++;
                            var eml = m.emails.length > 0 ? m.emails[0].address : '';
                            if (m.emails.length > 0){
                                m.currentEmail = m.emails[0].address;
                                m.save(function(){
                                    emailsUpdated++;
                                    domember();
                                });
                                if (membersChecked % 10 == 0)
                                    console.log(membersChecked);
                            }
                            else domember();
                        } else dopart();
                    }
                    
                    function dopart(){
                        var p = partsToUpdate.shift();
                        if (p){
                            var m = getMember(p.memberId);
                            if (m!= null){
                                if (m.clubMemberId.length > 0 || m.currentEmail.length > 0){
                                    if (p.driver){
                                        p.driver.clubMemberId = m.clubMemberId.toString();
                                        p.driver.currentEmail = m.currentEmail.toString();
                                        p.save(function(er){
                                            partsUpdated++;
                                            dopart();
                                        });
                                    }
                                    else dopart();
                                    
                                }
                                else dopart();
                            }
                            else dopart();
                            
                        }
                        else {

                            message = 'Upgrade done in ' + (new Date().getTime() - start) + 'ms.  Updated ' + emailsUpdated + ' member currentEmail and ' + partsUpdated + ' participant records.';
                            finish();
                        } 
                            
                    }
                    
                    domember();

                }
            })
        } 
    })

}
function upgrade2(callback){
	// part
	// finalTime, finalBesttime
	// event
	// uniqueNumberPerClass = season.uniqueNumberPerClass
	// maxRunsPerDriver = 0

	// season minimumClassParticipationPoints, minimumPaxParticipationPoints, classPointsCalcMethod = 'default'
	// eventsToQualify = classMaxEvents

	// do seasons
	var seasons = []
		, events = []
		, participants = [];
	var partCount = 0
		, pix = 0;
	function dopart(){
		var p = participants.shift();
		if (p === undefined){
			callback();
		}
		else {
			pix++;

			console.log('doing participant ' + pix + ' of ' + partCount);
			p.finalTime = p.bestTime;
			p.finalPaxTime = p.bestPaxTime;
			p.save(function(er){
				if (er) console.log('error saving part ' + p._id.toString() + ': ' + er);
				dopart();
			})

		}
	}


	function doevent(){
		var ev = events.shift();
		if (ev === undefined){
			dopart();
		}
		else {
			console.log('doing event ' + ev.eventNumber + ' in ' + ev.season);
			if (ev.maxRunsPerDriver == 0)
				ev.maxRunsPerDriver = 0;
			ev.uniqueNumberPerClass = true;
			ev.save(function(er){
				if (er) console.log('error saving event ' + ev._id.toString() + ': ' + er);
				doevent();
			})

		}
	}

	function doseason() {
		var season = seasons.shift();
		if (season === undefined){
			console.log('done with seasons');
			doevent();
		}
		else {
			console.log('doing season ' + season.seasonYear);
			season.minimumClassParticipationPoints = 0;
			season.minimumPaxParticipationPoints = 0;
			season.classPointsCalcMethod = 'default';
			season.timeCalcMethod = 'default';
			season.timePaxCalcMethod = 'default';
			if (season.eventsToQualify == 0)
				season.eventsToQualify = season.classMaxEvents;
			season.save(function(er){
				if (er) console.log('error saving season ' + season.seasonYear + ': ' + er);
				doseason();
			});

		}
	}
	models.seasons.find({}, function(er, _seasons){
		seasons = _seasons;
		models.events.find({}, function(er, _events){
			events = _events;
			models.participants.find({}, function(er, _parts){
				partCount = _parts.length;
				participants = _parts;
				doseason();
			})
		})
	})
}

module.exports = function(_models){
	models = _models;
	return {
		upgrade1:upgrade1
		, upgrade2:upgrade2
	}
}