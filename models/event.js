module.exports = function (mongoose) {

    var CheckinSchema = new mongoose.Schema({
        runGroup: String
        , name: String
        , session: Number
    });
    var StationSchema = new mongoose.Schema({
        name: String
        , checkins: [CheckinSchema]
        , assigned: [CheckinSchema]
    });
    var PointsSchema = new mongoose.Schema({
        eventNumber: Number, points: Number
    });
    var DriverSchema = new mongoose.Schema({
        name: String, id: String
    });
    

    var RunGroupSchema = new mongoose.Schema({
        name: String, color: String
    });
    var EventSchema = new mongoose.Schema({
        club: {
            name: String
            , id:String
        }
        , name: String
        , date: String
        , dateInt: Number
        , season: Number
        , currentSession: { type: Number, default: 1 }
        , currentRunGroup: { name: String, color: String, label:String }
        , eventNumber: { type: Number, default: 0 }
        , actualEventNumber: { type: Number, default: 0 }
        , location: { name: String, coords: String }
        , workerRoles: [{ role: String, password:String }]
        , courseMap: { url: String, designer: String, path:String }
        , runGroups: [{ name: String, color: String, label:String }]
        , uploadResults: { type: Boolean, default: false }
        , participantCount: { type: Number, default: 0 }
        , totalRuns: { type: Number, default: 0 }
        , stations: [StationSchema]
        , sessions: { type: Number, default: 1 }
        , countForPoints:Boolean
        , rmLiveUrl:{type:String, default:null}
        , classRunGroups:[
            {runGroup:String, baseClass:String, paxClass:String}
        ]
        , leaderBoard: [
            { driver: String, total: Number, totalwDrops:Number
                , memberId:String, axClass: String
                , rank: Number
                //, points: [PointsSchema]
                , points:[Number]
                , priorRank: Number
                , priorTotal: Number
                , rankDiff:Number
                , board: String
                , eventCount:Number
                , eventNum:Number }
        ]
        , paxLeaderBoard:[{ driver: String, total: Number, totalwDrops:Number
                , memberId:String, axClass: String
                , rank: Number
                , points:[Number]
                , priorRank: Number
                , priorTotal: Number
                , rankDiff:Number
                , board: String
                , eventCount:Number
                , eventNum:Number 
                , event1:Number 
                , event2:Number 
                , event3:Number 
                , event4:Number 
                , event5:Number 
                , event6:Number 
                , event7:Number 
                , event8:Number 
                , event9:Number 
                , event10:Number 
                , event11:Number 
                , event12:Number 
                , event13:Number 
                , event14:Number 
                , event15:Number 
                , event16:Number 
                , event17:Number 
                , event18:Number 
                , event19:Number 
                , event20:Number  
                , event21:Number 
                , event22:Number 
                , event23:Number 
                , event24:Number 
                , event25:Number 
                , event26:Number 
                , event27:Number 
                , event28:Number 
                , event29:Number 
                , event30:Number 
                , event31:Number 
                , event32:Number 
                , event33:Number 
                , event34:Number 
                , event35:Number 
                , event36:Number 
                , event37:Number 
                , event38:Number 
                , event39:Number 
                , event40:Number}]
        , classLeaderBoard:[{ driver: String, total: Number, totalwDrops:Number
                , memberId:String, axClass: String
                , rank: Number
                , points:[Number]
                , priorRank: Number
                , priorTotal: Number
                , rankDiff:Number
                , board: String
                , eventCount:Number
                , eventNum:Number 
                , event1:Number 
                , event2:Number 
                , event3:Number 
                , event4:Number 
                , event5:Number 
                , event6:Number 
                , event7:Number 
                , event8:Number 
                , event9:Number 
                , event10:Number 
                , event11:Number 
                , event12:Number 
                , event13:Number 
                , event14:Number 
                , event15:Number 
                , event16:Number 
                , event17:Number 
                , event18:Number 
                , event19:Number 
                , event20:Number 
                , event21:Number 
                , event22:Number 
                , event23:Number 
                , event24:Number 
                , event25:Number 
                , event26:Number 
                , event27:Number 
                , event28:Number 
                , event29:Number 
                , event30:Number 
                , event31:Number 
                , event32:Number 
                , event33:Number 
                , event34:Number 
                , event35:Number 
                , event36:Number 
                , event37:Number 
                , event38:Number 
                , event39:Number 
                , event40:Number}]
        , coneCounterAdvancedMode: {type:Boolean, default:true}
        , conePenalty:{type:Number, default:1}
        , numberOfSplits:{type:Number, default:0}
        , maxRunsPerDriver:{type:Number, default:0}
        , uniqueNumberPerClass:{type:Boolean, default:false}
        
    });
    EventSchema.index({ 'club.name': 1, 'date': 1, 'dateInt':-1 });

    this.model = mongoose.model('EventModel', EventSchema);
    return this;
}
// var LeaderboardSchema = new mongoose.Schema({
    //     name: String
    //     , memberId:String
    //     , driverName: String
    //     , driverId:String
    //     , type: String
    //     , total: Number
    //     , rank: Number
    //     , priorTotal: Number
    //     , priorRank: Number
    //     , totalDrops: Number
    //     , rankDrops: Number
    //     , priorRankDrops: Number
    //     , priorTotalDrops: Number
    //     , points: [PointsSchema]
    // });
//var mongoose = require('mongoose')
//  , Schema = mongoose.Schema;

//var EventSchema = new Schema({
//    club: {
//        name: String
//    }
//	, date: Date
//	, season: Number
//	, eventNumber: { type: Number, default: 0 }
//	, location: { name: String, coords: String }
//	, workerRoles: [{ role: String }]
//	, courseMap: { url: String, designer: String }
//	, runGroups: [{ name: String, color: String }]
//	, uploadResults: { type: Boolean, default: false }
//});
//EventSchema.index({ 'club.name': 1, 'date': 1 });

//module.exports = mongoose.model('EventModel', EventSchema);