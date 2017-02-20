
var models = {};

var leaderboard = function(board, eventNum, eventsToQualify, maxEvents, totalEvents){
	var list = [];

	function getByMemberId(memberId, axClass){
		var result = null;
		for (var i = 0; i < list.length; i++) {
			if (list[i].memberId == memberId && axClass == list[i].axClass){
				result = {lb:list[i],ix:i};
				break;
			}
		};

		return result;
	}

	function get(memberId, axClass){
		var r = getByMemberId(memberId, axClass);
		if (!r) return null;
		
		// if (eventNum > r.lb.eventNum){
			
		// 	for (var i = r.lb.eventNum+1; i<=eventNum;i++){
		// 		r.lb['event'+i] = -1;
		// 	}
		// }
		return r;
	}
	function record (){
		var r = { driver: '', total: 0, totalwDrops:-1
	        , memberId:'', axClass: null
	        , rank: 0
	        , priorRank: -1
	        , priorTotal: 0
	        , rankDiff:0 
	        , board: board
	        , eventCount:0 
	        , eventNum:eventNum
	        , points:[]
    	};

	    for (var i = 1; i <= eventNum; i++) {
	    	r['event'+i] = -1;
	    };
		return r;
	}

	function doDrops(points){
		//TODO finish
		var sum = 0
			, eventCount = points.length
			, pts = points.slice(0)
			;
		if (eventCount > maxEvents){
			// do top n events
			pts.sort(function(a,b){
				return a > b ? -1 : a < b ? 1 : 0;
			});
			for (var i = 0; i < maxEvents; i++) {
				sum += pts[i];
			};
		}
		else {
			for (var i = 0; i < points.length; i++) {
				sum += points[i];
			};
		}
			
		return sum;
	}

	return {
		getByMemberId: getByMemberId
		, get: get
		, getAll:function(){return list.slice(0);}
		, empty:function(){list=[];ids=[];}
		, load:function(lbs){
			list = lbs.slice(0);
			for (var i =0;i<list.length;i++){
				list[i]['event'+eventNum] = -1;
			}
		}
		, doTotal:function(){
			//console.log('event ' + eventNum + ' dototal for ' + board + ' list=' + list.length)
			if (board == 'PAX'){
				list.sort(function(a,b){
					if (a.totalwDrops > b.totalwDrops) return -1;
					else if (a.totalwDrops < b.totalwDrops) return 1;
					else return 0;
				})
				var rank = 1
					, lastPoints = list[0].totalwDrops;

				for (var i = 0; i < list.length; i++) {
					if (list[i].totalwDrops > -1){
						if (lastPoints != list[i].totalwDrops)
							rank++;
						if (list[i]['event'+eventNum] == -1){
							//do prior
							list[i].priorRank = list[i].rank;
							list[i].priorTotal = list[i].total;
						}
						list[i].rank = rank;
						list[i].rankDiff = rank - list[i].priorRank;
						lastPoints = list[i].totalwDrops;
					}
				};
			} else if (board == 'CLASS'){
				list.sort(function(a,b){
					if (a.axClass == b.axClass)
		            {
		                if (a.totalwDrops == b.totalwDrops)
		                    return a.eventCount < b.eventCount ? -1 : 1;
		                else 
		                    return a.totalwDrops < b.totalwDrops ? 1 : -1;
		            }
		            return a.axClass < b.axClass ? -1 : 1;
				})
				var lastClass = '', rank = 1, lastPoints = list[0].totalwDrops;
				for (var i = 0; i < list.length; i++) {
					if (list[i].totalwDrops > -1){
						if (list[i].axClass != lastClass){
							rank = 1;
							lastClass = list[i].axClass;
							lastPoints = list[i].totalwDrops;
						}
						if (lastPoints != list[i].totalwDrops)
							rank++;
						if (list[i]['event'+eventNum] == -1){
							//do prior
							list[i].priorRank = list[i].rank;
							list[i].priorTotal = list[i].total;
						}
						list[i].rank = rank;
						list[i].rankDiff = rank - list[i].priorRank;
						lastPoints = list[i].totalwDrops;
					}
				};
			}
				
		}
		, addPoints: function(boards, memberId, name, axClass, points){
			var r = get(memberId, axClass);

			if (r === null){
				r = {lb:new record(), ix:-1}
				r.lb.memberId = memberId;
				r.lb.driver = name;
				if (board === 'CLASS')
					r.lb.axClass = axClass;
				r.lb.total = 0;
			}
			
			r.lb.priorTotal = r.lb.total;
			r.lb.priorRank = r.lb.rank;
			r.lb['event'+eventNum] = points;
			r.lb.total = Math.floor((r.lb.total + points) * 1000) / 1000;
			r.lb.eventCount+= 1;
			r.lb.eventNum = eventNum;
			r.lb.points.push(points);
			r.lb.totalwDrops = Math.floor(doDrops(r.lb.points) * 1000) / 1000;
			// if (memberId == '52f94aba7ec359424c000635'){
			// 	console.log('after ' + eventNum + ' ' + board + ', pts=' + points + ', class=' + axClass);
			// }
			if (r.ix === -1) list.push(r.lb);
			else list[r.ix] = r.lb;
		}
		, record:record
		
	}
};

function recalcEvent(ev, eventNum, season, previousLb, callback){
	var start = new Date().getTime();
	console.log('leaderboard recalc for event ' + eventNum);
	models.participants.find({eventId:ev._id}).sort().exec(function(er, parts){
		if (er) callback('Error retriving participants.');
		else {
			
				doit();

			function checkPrevious(callback){
				if (!previousLb && eventNum > 1){
					//TODO get the previous event's leaderboards
					var evn = 1;
					models.events.find({season:ev.season, countForPoints:true}).sort({dateInt:1}).exec(function(er, evs){
						if (er) callback('There was an error retrieving events checking previous.');
						else {
							var pev = null;
							if (evs.length >= eventNum){
								pev = evs[eventNum -2];
								//TODO check this more?
								previousLb = {CLASS:pev.classLeaderBoard, PAX:pev.paxLeaderBoard}
								callback();
							}
							else
								callback('There was no previous event found.')
						}
					})
				}
			}

			function doit(){
				if (!season){
					models.seasons.findOne({seasonYear: ev.season}, function(er, ssn){
						if (er) callback('No season configured for ' + ev.season);
						else {
							season = ssn;
							doit();
						}
					})
				} else if (!previousLb && eventNum > 1){
					checkPrevious(function(er){
						if (er) callback('ERROR: ' + er );
						else
							doit();
					})
				} else {
					var plb = new leaderboard('PAX', eventNum, season.eventsToQualify, season.paxMaxEvents)
						, clb = new leaderboard('CLASS', eventNum, season.eventsToQualify, season.classMaxEvents);
					if (previousLb != null){
						plb.load(previousLb.PAX);
						clb.load(previousLb.CLASS);
					} 
					
					for (var i = 0; i < parts.length; i++) {
						var p = parts[i];

						if (p.axClass.name.toLowerCase().indexOf('fun') == -1 && p.memberId !== null){

							var classToUse = (p.axClass.paxClass.trim().length > 0 ? p.axClass.paxClass : p.axClass.name);
							clb.addPoints('CLASS', p.memberId.toString(), p.driver.name, classToUse, p.classPoints);
						
							plb.addPoints('PAX', p.memberId.toString(), p.driver.name, null, p.paxPoints);
						}
					};
					clb.doTotal();
					plb.doTotal();
					ev.classLeaderBoard = clb.getAll();
					ev.paxLeaderBoard = plb.getAll();
					ev.actualEventNumber = eventNum;
					ev.save(function(er){
						//TODO error trap
						console.log('EVENT #' + eventNum + ' duration: ' + (new Date().getTime() - start) + 'ms')
						callback(null, {CLASS:clb.getAll(), PAX:plb.getAll()});
					});
				}
			}
		}
		
	})
}


function recalcSeason(num, callback){
	var eventList = [];
	//TODO pass in club
	models.seasons.findOne({seasonYear: num}, function(er, season){
		if (er || !season) callback('Season does not exist.');
		else {
			models.events.find({season:num, countForPoints:true}).sort({'dateInt':1}).exec(function(er,events){
				var eventNum = 1;
				if (er || events.length == 0) callback('Error or no events yet for the ' + num + ' season.');
				else {
					eventList = events.slice(0);
					doOne();
				}
				var plb = null;
				function doOne(){
					var ev = eventList.shift();
					if (!ev) {
						callback(null, plb);
					}
					else {
						console.log('recalcing event ' + eventNum)
						recalcEvent(ev, eventNum, season, plb, function(er, lb){
							plb = lb;
							eventNum++;
							doOne();
						})
					}
				}
			})
		}
	})
}

var base = {
	calcEvent: recalcEvent
	, calcSeason: recalcSeason
}

module.exports = function(_config){
	models = _config.models;
	return base;
}