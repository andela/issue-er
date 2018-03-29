const joi = require('joi')

const schema = joi.object({
  MANAGERS: joi.string().required()
})
  .unkown()
  .required()

const { error, value: vars } = joi.validate(process.env, schema)

if (error) throw new Error(`Config validation error: ${error.message}`)

const config = {
  team: {
    managers: vars.MANAGERS.split(',')
  }
}

module.exports = config
