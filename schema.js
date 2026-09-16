const Joi = require('joi');

module.exports.listingSchema = Joi.object({
    listing: Joi.object({
        title: Joi.string().required(),
        description: Joi.string().allow('', null),
        location: Joi.string().required(),
        country: Joi.string().required(),
        price: Joi.number().required().min(0),
        image: Joi.alternatives().try(
            Joi.string().allow('', null),
            Joi.object({
                filename: Joi.string().allow('', null),
                url: Joi.string().allow('', null)
            })
        )
    }).required()
}).unknown(true);

module.exports.reviewSchema = Joi.object({
    review: Joi.object({
        rating: Joi.number().required().min(1).max(5),
        comment: Joi.string().required()
    }).required()
}).unknown(true);

module.exports.userSchema = Joi.object({
    user: Joi.object({
        username: Joi.string().required().min(3).max(30),
        email: Joi.string().email().required(),
        password: Joi.string().required().min(4)
    }).required()
}).unknown(true);

