module.exports = function (mongoose) {

    var ObjectId = mongoose.Schema.ObjectId;

    var MemberSchema = new mongoose.Schema({
        club: { name: String, id: String }
        , firstName:String
        , lastName: String
        , clubMemberId: {type:String, default:''}
        , isMember: { type: Boolean, default: false }
        , msrId:  {type:String, default:''}
        , cars: [{
            description: String
            , make: String
            , model: String
            , year: Number
            , color: String
        }]
        , lastAxClass: {type:String, default:''}
        , lastPaxClass: {type:String, default:''}
        , dedicatedNumber:  {type:String, default:''}
        , clubRegion: {type:String, default:''}
        , totalEvents: { type: Number, default: 0 }
        , totalRuns: { type: Number, default: 0 }
        , totalDnfs: { type: Number, default: 0 }
        , totalReruns: { type: Number, default: 0 }
        , dateJoined: String
        , dateCreated: Date
        , dateUpdated: Date
        , mailNewsLetter: {type:Boolean, default:false}
        , emailNewsLetter:{type:Boolean, default:false}
        , addresses:[
            {addrType:String // Mailing, Billing
                , street:String, street2:String, city:String, state:String, zip:String}
        ]
        , emails:[
            {address:String}
        ]
        , phones:[{phoneType:String //work, personal, 
            , number:String}]
        , membershipExpiresOnInt:Number
        , sponsors:[{name:String}]
        , dedicatedClass:{type:String, default:''}
        , dedicatedPaxClass: {type:String, default:''}
        , currentEmail: {type:String, default:''}
    });
    MemberSchema.index({ 'club.id': 1, msrId: 1 });
    MemberSchema.virtual('fullName').get(function () {
        return this.firstName + ' ' + this.lastName;
    });
    this.model = mongoose.model('MemberModel', MemberSchema);
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