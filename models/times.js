module.exports = function (mongoose) {
    var TimeSchema = new mongoose.Schema({
        eventId: String
        , start: Number
        , finish: Number
        , time: Number
        , order: Number // 
        , timestamp: Number
        , runId:{type:String, default:''}
    });
    TimeSchema.index({ 'eventId': -1 });
    this.model = mongoose.model('TimesModel', TimeSchema);
    return this;
}