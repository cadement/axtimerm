module.exports = function (mongoose) {

    var ObjectId = mongoose.Schema.ObjectId;

    var PaticipantSchema = new mongoose.Schema({
        eventId: ObjectId
        , club: { name: String, id:String }
        , runGroup: { name: {type:String,default:''}, color: {type:String,default:''}, label:{type:String, default:''} }
        , memberId:ObjectId
        , driver: {
            name: String
            , firstName: { type: String, default: '' }
            , lastName: { type: String, default: '' }
            , car: {
                description: String
                , make: String
                , model:String
                , year: Number
                , color: String
            }
            , carNumber: String
            , id: ObjectId
            , externalId: String
            , clubMemberId: { type: String, default: '' }
            , currentEmail: { type: String, default: '' }
        }
        , checkedIn: { type: Boolean, default: false }
        , station: String
        , axClass: { name: String, paxClass:String, index: { type: Number, default: 1.0 }, isLadies: { type: Boolean, default: false }, isStock:Boolean, category:String, include:Boolean, description:String }
        , workerRole: {type:String, default:''}
        , isTechd: { type: Boolean, default: false }
        , paid: { type: Boolean, default: false }
        , finalTime: {type: Number, default:0.0}
        , finalPaxTime: {type: Number, default:0.0}
        , bestTime: { type: Number, default: 0.0 }
        , bestPaxTime: { type: Number, default: 0.0 }
        , rankOverall: { type: Number, default: 0 }
        , rankClass: { type: Number, default: 0 }
        , rankPax: { type: Number, default: 0 }
        , diffOverall: { type: Number, default: 0.0 }
        , diffPax: { type: Number, default: 0.0 }
        , diffClass: { type: Number, default: 0.0 }
        , diffPrevOverall: { type: Number, default: 0.0 }
        , diffPrevPax: { type: Number, default: 0.0 }
        , diffPrevClass: { type: Number, default: 0.0 }
        , totalCones: { type: Number, default: 0 }
        , totalDnfs: { type: Number, default: 0 }
        , totalReruns: { type: Number, default: 0 }
        , totalRuns: { type: Number, default: 0 }
        , totalCountedRuns: { type: Number, default: 0 }
        , isImported:{type:Boolean, default:false}
        , paxPoints:{type:Number, default:0}
        , classPoints:{type:Number, default:0}
        , isRookie:{type:Boolean, default:false}
    });
    PaticipantSchema.index({ 'eventId': 1, 'driver.id': 1 });

    this.model = mongoose.model('PaticipantModel', PaticipantSchema);
    return this;
}

//var mongoose = require('mongoose')
//  , Schema = mongoose.Schema;

//var PaticipantSchema = new Schema({
//    eventId: ObjectId
//	, club: { name: String }
//	, runGroup: { name: String, color: String }
//	, driver: { name: String, id: ObjectId }
//	, car: {
//	    description: String
//        , year: Number
//        , color: String
//	}
//	, axClass: { name: String, index: { type: Number, default: 1.0 } }
//	, carNumber: String
//	, workerRole: String
//	, isTechd: { type: Boolean, default: false }
//	, paid: { type: Boolean, default: false }
//	, bestTime: { type: Number, default: 0.0 }
//	, bestPaxTime: { type: Number, default: 0.0 }
//	, rankOverall: { type: Number, default: 0 }
//	, rankClass: { type: Number, default: 0 }
//	, rankPax: { type: Number, default: 0 }
//	, totalCones: { type: Number, default: 0 }
//	, totalDnfs: { type: Number, default: 0 }
//	, totalReruns: { type: Number, default: 0 }
//	, totalRuns: { type: Number, default: 0 }
//	, totalCountedRuns: { type: Number, default: 0 }
//});
//PaticipantSchema.index({ 'eventId': 1, 'driver.id': 1 });


//module.exports = mongoose.model('PaticipantModel', PaticipantSchema);