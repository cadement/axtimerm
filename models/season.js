module.exports = function (mongoose) {

    var ObjectId = mongoose.Schema.ObjectId;

    var SeasonSchema = new mongoose.Schema({
        clubId: ObjectId
        , seasonYear: Number
        , classPoints: [{ position: Number, points: Number }]
        , paxPoints: [{ position: Number, points: Number }]
        , classes: [{
            name: String
            , category:{type:String, default:''}
            , index: { type: Number, default: 1.0 }
            , description:{type:String, default:''}
            , isLadies: {type:Boolean, default:false}
            , isStock:{type:Boolean, default:false} 
            , include:{type:Boolean, default:true}
            , paxClass:{type:String,default:''}
        }]
        , paxClasses: [{name:String, isLadies:Boolean, isStock:Boolean, description:String, category:String}]
        , totalEvents: { type: Number, default: 0 }
        , paxMaxEvents: { type: Number, default: 0 }
        , classMaxEvents: { type: Number, default: 0 }
        , conePenalty: { type: Number, default: 1 }
        , eventsToQualify: {type:Number, default:0}
        , classPointsCalcMethod: {type:String, default:'default'}  // values in models/config.js
        , minimumClassParticipationPoints: {type:Number, default:0}
        , minimumPaxParticipationPoints: {type:Number, default:0}
        , timeCalcMethod: {type:String, default:'default'}  // values in models/config.js
        , timePaxCalcMethod: {type:String, default:'default'} // values in models/config.js

    });
    SeasonSchema.index({ 'clubId': 1, 'seasonYear': 1 });

    this.model = mongoose.model('SeasonModel', SeasonSchema);
    return this;
}

