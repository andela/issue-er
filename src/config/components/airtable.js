const joi = require('joi')

const schema = joi.object({
  AIRTABLE_BASE: joi.string().required(),
  AIRTABLE_API_KEY: joi.string().required(),
  AIRTABLE_VIEW_ENDPOINT: joi.string().required()
})
  .unkown()
  .required()

const { error, value: vars } = joi.validate(process.env, schema)

if (error) throw new Error(`Config validation error: ${error.message}`)

const config = {
  airtable: {
    base: vars.AIRTABLE_BASE,
    key: vars.AIRTABLE_API_KEY,
    view: vars.AIRTABLE_VIEW_ENDPOINT
  }
}

module.exports = config
