module.exports = function (mongoose) {
    var ObjectId = mongoose.Schema.ObjectId;

    var StationSchema = new mongoose.Schema({
        station: Number
        , cones: Number
    });
    var RunSchema = new mongoose.Schema({
        runNumber: Number
        , driverRunNumber: { type: Number, default: 1 }
        , eventId: ObjectId
        , club: { name: String, id:String }
        , driver: {
            name: String
            , car: {
                description: String
                , make: String
                , model: String
                , year: Number
                , color: String
            }
            , carNumber: String
            , id:ObjectId
            , memberId:ObjectId
        }
        , memberId:String
        , participantId:String
        , runGroup: { name: {type:String,default:''}, color: {type:String,default:''}, label:{type:String, default:''} }
        , session: Number
        , axClass: { name: String, paxClass:String, index: { type: Number, default: 1.0 }, isLadies: { type: Boolean, default: false }, isStock:Boolean, category:String, include:Boolean, description:String }
        , isCompleted: { type: Boolean, default: false }
        , status: {
            type: String // Q = queued, R=running, F=finished
            , default: 'Q'
        }
        , rawTime: { type: Number, default: 0.0 }
        , totalTime: {type:Number, default:0.0}
        , paxTime: { type: Number, default: 0.0 }
        , cones: { type: Number, default: 0 }
        , isDnf: { type: Boolean, default: false }
        , getsRerun: { type: Boolean, default: false }
        , isOff: { type: Boolean, default: false }
        , finishTimestamp: Date
        , coneHits: [StationSchema]
        , splitTimes:[{type:Number}]
        , timeOffBest:{type:Number, default:0}
        , timeOffPax: {type:Number, default:0}
        , rankOverallChange: {type:Number, default:0}
        , rankClassChange:{type:Number, default:0}
        , rankPaxChange:{type:Number, default:0}
        , rankOverall:{type:Number, default:0}
        , rankClass:{type:Number, default:0}
        , rankPax:{type:Number, default:0}
    });

    RunSchema.index({ 'eventId': 1 });
    RunSchema.index({ 'runNumber': 1 });
    RunSchema.index({ 'participantId': 1 });

    //RunSchema.virtual('paxTime').get(function () {
    //    return (this.axClass.index * (this.rawTime + this.cones));
    //});
    // RunSchema.virtual('totalTime').get(function () {
    //     return this.rawTime + this.cones;
    // });

    RunSchema.set('toJSON', { virtuals: true });

    this.model = mongoose.model('RunModel', RunSchema);
    return this;
}

