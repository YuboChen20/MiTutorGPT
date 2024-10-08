const AnnotationGuide = require('./AnnotationGuide')
const Exercise = require('./Exercise')
const Level = require('./Level')
const LanguageUtils = require('../../utils/LanguageUtils')
const DefaultCriteria = require('../../specific/review/DefaultCriteria')

class Review extends AnnotationGuide {
  constructor ({reviewId = '', storageGroup = ''}) {
    super({name: reviewId, storageGroup})
    this.criterias = this.guideElements
  }

  toAnnotations () {
    let annotations = []
    annotations.push(this.toAnnotation())
    // Create annotations for all criterias
    for (let i = 0; i < this.criterias.length; i++) {
      annotations = annotations.concat(this.criterias[i].toAnnotations())
    }
    return annotations
  }

  toAnnotation () {
    return {
      group: this.storageGroup.id,
      permissions: {
        read: ['group:' + this.storageGroup.id]
      },
      references: [],
      tags: ['review:default'],
      target: [],
      text: '',
      uri: this.storageGroup.links ? this.storageGroup.links.html : this.storageGroup.url // Compatibility with both group representations getGroups and userProfile
    }
  }

  static fromCriterias (criterias) {
    let review = new Review({reviewId: ''})
    for (let i = 0; i < criterias.length; i++) {
      let criteria = new Exercise({name: criterias[i].name, description: criterias[i].description, solution: criterias[i].solution, custom: criterias[i].custom, group: criterias[i].group, resume: criterias[i].resume, alternative: criterias[i].alternative, review})
      criteria.levels = []
      for (let j = 0; j < criterias[i].levels.length; j++) {
        let level = new Level({name: criterias[i].levels[j].name, criteria: criteria})
        criteria.levels.push(level)
      }
      review.criterias.push(criteria)
    }
    return review
  }

  toObject () {
    let object = {
      criteria: [],
      defaultLevels: DefaultCriteria.defaultLevels
    }
    // For each criteria create the object
    for (let i = 0; i < this.criterias.length; i++) {
      let criteria = this.criterias[i]
      if (LanguageUtils.isInstanceOf(criteria, Exercise)) {
        object.criteria.push(criteria.toObject())
      }
    }
    return object
  }
}

module.exports = Review
