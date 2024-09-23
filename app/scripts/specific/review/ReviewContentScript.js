import CustomExercisesManager from './CustomExercisesManager'
import ReviewGenerator from './ReviewGenerator'
const _ = require('lodash')

class ReviewContentScript {
  constructor (config) {
    this.config = config
  }

  init (callback) {
    window.abwa.specific = window.abwa.specific || {}
    window.abwa.specific.reviewGenerator = new ReviewGenerator()
    window.abwa.specific.reviewGenerator.init(() => {

    })
    window.abwa.specific.CustomExercisesManager = new CustomExercisesManager()
    window.abwa.specific.CustomExercisesManager.init(() => {

    })
    if (_.isFunction(callback)) {
      callback()
    }
  }

  destroy () {
    window.abwa.specific.reviewGenerator.destroy()
    window.abwa.specific.CustomExercisesManager.destroy()
  }
}

export default ReviewContentScript
