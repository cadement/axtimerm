module.exports = function(models, mongoose){


	models.runs = require('./run')(mongoose).model;
	models.clubs = require('./club')(mongoose).model;
	models.clubClasses = require('./clubClass')(mongoose).model;
	models.events = require('./event')(mongoose).model;
	models.participants = require('./participant')(mongoose).model;
	models.ttods = require('./ttod')(mongoose).model;
	models.audit = require('./audit')(mongoose).model;
	models.users = require('./user')(mongoose).model;
	models.seasons = require('./season')(mongoose).model;
	models.members = require('./member')(mongoose).model;
	models.times = require('./times')(mongoose).model;


	models.roles = [
	{ name: "Club Admin", urltoken:"clubadmin" }
	, { name: "Event Admin", urltoken: "admin" }
	, { name: "Time Keeper", urltoken: "queue" }
	, { name: "Cone Counter", urltoken: "conecounter" }
	, { name: "Car Queuer", urltoken: "carqueuer" }
	, { name: "Tech Inspector", urltoken: "techinspector" }
	, { name: "Registrar", urltoken: "registrar" }
	, { name: "Worker Checkin", urltoken: "workercheckin" }
	];

	models.stations = [];
	models.stations.push('Waivers');
	models.stations.push('Computer');
	models.stations.push('Countrol');
	models.stations.push('Car Queuer');
	models.stations.push('Announcer');
	models.stations.push('Starter');
	models.stations.push('Grid');
	models.stations.push('OPs');
	models.stations.push('Safety');
	models.stations.push('Helmets');
	models.stations.push('Course Captain #1');
	models.stations.push('Course Captain #2');
	models.stations.push('Course Captain #3');
	models.stations.push('Course Captain #4');
	models.stations.push('Course Captain #5');

	for (var i = 1; i < 13; i++) {
	    models.stations.push('Course #' + i);
	}

	models.runGroups = [];
	models.runGroups.push({ name: 'Red', color: 'red', number:1, selected:false });
	models.runGroups.push({ name: 'Blue', color: 'blue', number:2, selected: false });
	models.runGroups.push({ name: 'Green', color: 'green', number:3, selected: false });
	models.runGroups.push({ name: 'Yellow', color: 'yellow', number:4, selected: false });
	models.runGroups.push({ name: 'Orange', color: 'orange', number:5, selected: false });
	models.runGroups.push({ name: 'Purple', color: 'purple', number:6, selected: false });
	models.runGroups.push({ name: 'Cyan', color: 'cyan', number:7, selected: false });

	models.interfaceTypes = [];
	models.interfaceTypes.push('JaCircuitsNormal');
	models.interfaceTypes.push('JaCircuitsChrono');

	models.classPointsCalcMethods = [];
	models.classPointsCalcMethods.push('default');
	models.classPointsCalcMethods.push('besttimediffpct');

	models.timeCalcMethods = [];
	models.timeCalcMethods.push('default');
	models.timeCalcMethods.push('multiheatsumbest');
	models.timeCalcMethods.push('sumallruns');


	models.timePaxCalcMethods = [];
	models.timePaxCalcMethods.push('default');




	//return models;
}