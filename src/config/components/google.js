const joi = require('joi')

const schema = joi.object({
  GOOGLE_CLIENT_ID: joi.string().required(),
  GOOGLE_CLIENT_SECRET: joi.string().required()
})
  .unkown()
  .required()

const { error, value: vars } = joi.validate(process.env, schema)

if (error) throw new Error(`Config validation error: ${error.message}`)

const config = {
  google: {
    id: vars.GOOGLE_CLIENT_ID,
    secret: vars.GOOGLE_CLIENT_SECRET,
  }
}

module.exports = config
