module.exports = function (mongoose) {

    var ObjectId = mongoose.Schema.ObjectId;

    var userSchema = new mongoose.Schema({
        firstName: String
        , lastName: String
        , email: String
        , username: String
        , epassword: String
        , eventId:String
        , role:String // Admin, Event Admin, Car Queuer, Cone Counter, Time Keeper, Registrar, Tech Inspector, Worker Checkin
        //, clubs: [{ name: String, id: String, isAdmin:Boolean }]
    });
    userSchema.index({ 'epassword': 1});

    this.model = mongoose.model('UserModel', userSchema);
    return this;
}
