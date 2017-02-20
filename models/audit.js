module.exports = function (mongoose) {

    var ObjectId = mongoose.Schema.ObjectId;

    var auditSchema = new mongoose.Schema({
        date: Date
        , source: String
        , description: String
        , eventId: ObjectId
    });
    auditSchema.index({ 'source': 1, 'eventId':1 });

    this.model = mongoose.model('AuditModel', auditSchema);
    return this;
}
