// const ReviewAssistant = require('../../specific/review/ReviewAssistant')
import ContentAnnotator from './ContentAnnotator'
import ContentTypeManager from '../ContentTypeManager'
import Tag from '../Tag'
import TagGroup from '../TagGroup'
import Events from '../Events'
import DOMTextUtils from '../../utils/DOMTextUtils'
import PDFTextUtils from '../../utils/PDFTextUtils'
import LanguageUtils from '../../utils/LanguageUtils'
import $ from 'jquery'
import _ from 'lodash'
import Alerts from '../../utils/Alerts'
import LLMTextUtils from '../../utils/LLMTextUtils'
import Config from '../../Config'
import AnthropicManager from '../../llm/anthropic/AnthropicManager'
import OpenAIManager from '../../llm/openAI/OpenAIManager'
require('components-jqueryui')
require('jquery-contextmenu/dist/jquery.contextMenu')
let swal = null
if (document && document.head) {
  swal = require('sweetalert2')
}

const ANNOTATION_OBSERVER_INTERVAL_IN_SECONDS = 3
const ANNOTATIONS_UPDATE_INTERVAL_IN_SECONDS = 60

class TextAnnotator extends ContentAnnotator {
  constructor (config) {
    super()
    this.events = {}
    this.config = config
    this.observerInterval = null
    this.reloadInterval = null
    this.allAnnotations = null
    this.highlightClassName = 'highlightedAnnotation'
  }

  init (callback) {
    this.initEvents(() => {
      // Retrieve current user profile
      this.currentUserProfile = window.abwa.groupSelector.user
      this.loadAnnotations(() => {
        this.initAnnotatorByAnnotation(() => {
          // Check if something is selected after loading annotations and display sidebar
          if (document.getSelection().toString().length !== 0) {
            if ($(document.getSelection().anchorNode).parents('#abwaSidebarWrapper').toArray().length === 0) {
              this.openSidebar()
            }
          }
          this.initAnnotationsObserver(() => {
            if (_.isFunction(callback)) {
              callback()
            }
          })
        })
      })
    })
  }

  initEvents (callback) {
    this.initSelectionEvents(() => {
      this.initAnnotateEvent(() => {
        this.initAnnotateByLLMEvent(() => {
          this.initUpdateAnnotationEvent(() => {
            this.initUpdateTagAnnotationEvent(() => {
              this.initReloadAnnotationsEvent(() => {
                this.initDeleteAllAnnotationsEvent(() => {
                  this.initDocumentURLChangeEvent(() => {
                    this.initTagsUpdatedEvent(() => {
                      // Reload annotations periodically
                      if (_.isFunction(callback)) {
                        callback()
                      }
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  }

  initDocumentURLChangeEvent (callback) {
    this.events.documentURLChangeEvent = {element: document, event: Events.updatedDocumentURL, handler: this.createDocumentURLChangeEventHandler()}
    this.events.documentURLChangeEvent.element.addEventListener(this.events.documentURLChangeEvent.event, this.events.documentURLChangeEvent.handler, false)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  initDeleteAllAnnotationsEvent (callback) {
    this.events.deleteAllAnnotationsEvent = {element: document, event: Events.deleteAllAnnotations, handler: this.createDeleteAllAnnotationsEventHandler()}
    this.events.deleteAllAnnotationsEvent.element.addEventListener(this.events.deleteAllAnnotationsEvent.event, this.events.deleteAllAnnotationsEvent.handler, false)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  initTagsUpdatedEvent (callback) {
    this.events.tagsUpdated = {element: document, event: Events.tagsUpdated, handler: this.createTagsUpdatedEventHandler()}
    this.events.tagsUpdated.element.addEventListener(this.events.tagsUpdated.event, this.events.tagsUpdated.handler, false)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  createTagsUpdatedEventHandler (callback) {
    return () => {
      this.updateAllAnnotations(() => {
      })
    }
  }

  createDeleteAllAnnotationsEventHandler (callback) {
    return () => {
      this.deleteAllAnnotations(() => {
      })
    }
  }

  createDocumentURLChangeEventHandler (callback) {
    return () => {
      this.loadAnnotations(() => {
      })
    }
  }

  initReloadAnnotationsEvent (callback) {
    this.reloadInterval = setInterval(() => {
      this.updateAllAnnotations(() => {
      })
    }, ANNOTATIONS_UPDATE_INTERVAL_IN_SECONDS * 1000)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  initAnnotateEvent (callback) {
    this.events.annotateEvent = {element: document, event: Events.annotate, handler: this.createAnnotationEventHandler()}
    this.events.annotateEvent.element.addEventListener(this.events.annotateEvent.event, this.events.annotateEvent.handler, false)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  initAnnotateByLLMEvent (callback) {
    this.events.annotateByLLMEvent = {element: document, event: Events.annotateByLLM, handler: this.createAnnotationByLLMEventHandler()}
    this.events.annotateByLLMEvent.element.addEventListener(this.events.annotateByLLMEvent.event, this.events.annotateByLLMEvent.handler, false)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  initUpdateAnnotationEvent (callback) {
    this.events.updateAnnotationEvent = { element: document, event: Events.updateAnnotation, handler: this.updateAnnotationEventHandler() }
    this.events.updateAnnotationEvent.element.addEventListener(this.events.updateAnnotationEvent.event, this.events.updateAnnotationEvent.handler, false)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  initUpdateTagAnnotationEvent (callback) {
    this.events.updateTagAnnotationEvent = { element: document, event: Events.updateTagAnnotation, handler: this.updateTagAnnotationEventHandler() }
    this.events.updateTagAnnotationEvent.element.addEventListener(this.events.updateTagAnnotationEvent.event, this.events.updateTagAnnotationEvent.handler, false)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  createAnnotationEventHandler () {
    return (event) => {
      // If selection is empty, return null
      if (document.getSelection().toString().length === 0) {
        // If tag element is not checked, no navigation allowed
        if (event.detail.chosen === 'true') {
          // Navigate to the first annotation for this tag
          this.goToNextAnnotationOfTag(event.detail.tags[0])
        } else {
          Alerts.infoAlert({text: chrome.i18n.getMessage('CurrentSelectionEmpty')})
        }
        return
      }
      // If selection is child of sidebar, return null
      if ($(document.getSelection().anchorNode).parents('#annotatorSidebarWrapper').toArray().length !== 0) {
        Alerts.infoAlert({text: chrome.i18n.getMessage('CurrentSelectionNotAnnotable')})
        return
      }
      let range = document.getSelection().getRangeAt(0)
      let selectors = TextAnnotator.getSelectors(range)
      // Construct the annotation to send to storage
      let annotation = TextAnnotator.constructAnnotation(selectors, event.detail.tags)
      window.abwa.storageManager.client.createNewAnnotation(annotation, (err, annotation) => {
        if (err) {
          Alerts.errorAlert({text: 'Unexpected error, unable to create annotation'})
        } else {
          // Add to annotations
          this.allAnnotations.push(annotation)
          LanguageUtils.dispatchCustomEvent(Events.updatedAllAnnotations, {annotations: this.allAnnotations})
          // Send event annotation is created
          LanguageUtils.dispatchCustomEvent(Events.annotationCreated, {annotation: annotation})
          this.highlightAnnotation(annotation, () => {
            window.getSelection().removeAllRanges()
          })
        }
      })
    }
  }

  createAnnotationByLLMEventHandler () {
    return (event) => {
      let selectors = event.detail.selectors
      let newTags = event.detail.tags
      // Construct the annotation to send to storage
      let commentData = event.detail.commentData
      let annotation = TextAnnotator.constructAnnotation(selectors, newTags, commentData)
      window.abwa.storageManager.client.createNewAnnotation(annotation, (err, annotation) => {
        if (err) {
          Alerts.errorAlert({text: 'Unexpected error, unable to create annotation'})
        } else {
          // Add to annotations
          this.allAnnotations.push(annotation)
          LanguageUtils.dispatchCustomEvent(Events.updatedAllAnnotations, {annotations: this.allAnnotations})
          // Send event annotation is created
          LanguageUtils.dispatchCustomEvent(Events.annotationCreated, {annotation: annotation})
          this.highlightAnnotation(annotation, () => {
            window.getSelection().removeAllRanges()
          })
        }
      })
    }
  }

  static getSelectors (range) {
    let selectors = []
    // Create FragmentSelector
    if (_.findIndex(window.abwa.contentTypeManager.documentType.selectors, (elem) => { return elem === 'FragmentSelector' }) !== -1) {
      let fragmentSelector = null
      if (window.abwa.contentTypeManager.documentType === ContentTypeManager.documentTypes.pdf) {
        fragmentSelector = PDFTextUtils.getFragmentSelector(range)
      } else {
        fragmentSelector = DOMTextUtils.getFragmentSelector(range)
      }
      if (fragmentSelector) {
        selectors.push(fragmentSelector)
      }
    }
    // Create RangeSelector
    if (_.findIndex(window.abwa.contentTypeManager.documentType.selectors, (elem) => { return elem === 'RangeSelector' }) !== -1) {
      let rangeSelector = DOMTextUtils.getRangeSelector(range)
      if (rangeSelector) {
        selectors.push(rangeSelector)
      }
    }
    // Create TextPositionSelector
    if (_.findIndex(window.abwa.contentTypeManager.documentType.selectors, (elem) => { return elem === 'TextPositionSelector' }) !== -1) {
      let rootElement = window.abwa.contentTypeManager.getDocumentRootElement()
      let textPositionSelector = DOMTextUtils.getTextPositionSelector(range, rootElement)
      if (textPositionSelector) {
        selectors.push(textPositionSelector)
      }
    }
    // Create TextQuoteSelector
    if (_.findIndex(window.abwa.contentTypeManager.documentType.selectors, (elem) => { return elem === 'TextQuoteSelector' }) !== -1) {
      let textQuoteSelector = DOMTextUtils.getTextQuoteSelector(range)
      if (textQuoteSelector) {
        selectors.push(textQuoteSelector)
      }
    }
    return selectors
  }

  static constructAnnotation (selectors, tags, commentData) {
    // Check if selectors exist, if then create a target for annotation, in other case the annotation will be a page annotation
    let target = []
    if (_.isObject(selectors)) {
      target.push({
        selector: selectors
      })
    }
    let data = {
      group: window.abwa.groupSelector.currentGroup.id,
      permissions: {
        read: ['group:' + window.abwa.groupSelector.currentGroup.id]
      },
      references: [],
      tags: tags,
      target: target,
      text: '',
      uri: window.abwa.contentTypeManager.getDocumentURIToSaveInStorage()
    }
    if (commentData && commentData.llm) {
      data.text = JSON.stringify({comment: commentData.comment, llm: commentData.llm, paragraph: commentData.paragraph})
    }
    if (commentData && commentData.sentiment) {
      let tag = TextAnnotator.findTagForSentiment(commentData.sentiment)
      data.tags.push(tag)
    }
    // Get link for all files
    data.document = {
      link: [{
        href: window.abwa.contentTypeManager.getDocumentURIToSaveInStorage()
      }]
    }
    // For pdf files it is also send the relationship between pdf fingerprint and web url
    if (window.abwa.contentTypeManager.documentType === ContentTypeManager.documentTypes.pdf) {
      let pdfFingerprint = window.abwa.contentTypeManager.pdfFingerprint
      data.document.documentFingerprint = pdfFingerprint
      data.document.link = data.document.link || []
      data.document.link.push({
        href: 'urn:x-pdf:' + pdfFingerprint
      })
    }
    // For local files
    if (window.abwa.contentTypeManager.localFile) {
      data.document.link = data.document.link || []
      data.document.link.push({
        type: 'localfile',
        href: window.abwa.contentTypeManager.localFilePath
      })
    }
    // If doi is available, add it to the annotation
    if (!_.isEmpty(window.abwa.contentTypeManager.doi)) {
      data.document = data.document || {}
      let doi = window.abwa.contentTypeManager.doi
      data.document.dc = { identifier: [doi] }
      data.document.highwire = { doi: [doi] }
      data.document.link = data.document.link || []
      data.document.link.push({href: 'doi:' + doi})
    }
    // If citation pdf is found
    if (!_.isEmpty(window.abwa.contentTypeManager.citationPdf)) {
      let pdfUrl = window.abwa.contentTypeManager.doi
      data.document.link = data.document.link || []
      data.document.link.push({href: pdfUrl, type: 'application/pdf'})
    }
    // If document title is retrieved
    if (_.isString(window.abwa.contentTypeManager.documentTitle)) {
      data.document.title = window.abwa.contentTypeManager.documentTitle
    }
    data.documentMetadata = data.document // Copy to metadata field because hypothes.is doesn't return from its API all the data that it is placed in document
    return data
  }

  initSelectionEvents (callback) {
    // Create selection event
    this.activateSelectionEvent(() => {
      if (_.isFunction(callback)) {
        callback()
      }
    })
  }

  activateSelectionEvent (callback) {
    this.events.mouseUpOnDocumentHandler = {element: document, event: 'mouseup', handler: this.mouseUpOnDocumentHandlerConstructor()}
    this.events.mouseUpOnDocumentHandler.element.addEventListener(this.events.mouseUpOnDocumentHandler.event, this.events.mouseUpOnDocumentHandler.handler)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  disableSelectionEvent (callback) {
    this.events.mouseUpOnDocumentHandler.element.removeEventListener(
      this.events.mouseUpOnDocumentHandler.event,
      this.events.mouseUpOnDocumentHandler.handler)
    if (_.isFunction(callback)) {
      callback()
    }
  }

  /**
   * Initializes annotations observer, to ensure dynamic web pages maintain highlights on the screen
   * @param callback Callback when initialization finishes
   */
  initAnnotationsObserver (callback) {
    this.observerInterval = setInterval(() => {
      // If a swal is displayed, do not execute highlighting observer
      if (document.querySelector('.swal2-container') === null) { // TODO Look for a better solution...
        if (this.allAnnotations) {
          for (let i = 0; i < this.allAnnotations.length; i++) {
            let annotation = this.allAnnotations[i]
            // Search if annotation exist
            let element = document.querySelector('[data-annotation-id="' + annotation.id + '"]')
            // If annotation doesn't exist, try to find it
            if (!_.isElement(element)) {
              Promise.resolve().then(() => { this.highlightAnnotation(annotation) })
            }
          }
        }
      }
    }, ANNOTATION_OBSERVER_INTERVAL_IN_SECONDS * 1000)
    // TODO Improve the way to highlight to avoid this interval (when search in PDFs it is highlighted empty element instead of element)
    this.cleanInterval = setInterval(() => {
      let highlightedElements = document.querySelectorAll('.highlightedAnnotation')
      highlightedElements.forEach((element) => {
        if (element.innerText === '') {
          $(element).remove()
        }
      })
    }, ANNOTATION_OBSERVER_INTERVAL_IN_SECONDS * 1000)
    // Callback
    if (_.isFunction(callback)) {
      callback()
    }
  }

  loadAnnotations (callback) {
    this.updateAllAnnotations((err) => {
      if (err) {
        // TODO Show user no able to load all annotations
      } else {
        // Current annotations will be
        this.allAnnotations = this.retrieveCurrentAnnotations()
        LanguageUtils.dispatchCustomEvent(Events.updatedAllAnnotations, {annotations: this.allAnnotations})
        // Highlight annotations in the DOM
        this.highlightAnnotations(this.allAnnotations)
        if (_.isFunction(callback)) {
          callback()
        }
      }
    })
  }

  updateAllAnnotations (callback) {
    // Retrieve annotations for current url and group
    window.abwa.storageManager.client.searchAnnotations({
      url: window.abwa.contentTypeManager.getDocumentURIToSearchInStorage(),
      uri: window.abwa.contentTypeManager.getDocumentURIToSaveInStorage(),
      group: window.abwa.groupSelector.currentGroup.id,
      order: 'asc'
    }, (err, annotations) => {
      if (err) {
        if (_.isFunction(callback)) {
          callback(err)
        }
      } else {
        // Search tagged annotations
        let filteringTags = window.abwa.tagManager.getFilteringTagList()
        this.allAnnotations = _.filter(annotations, (annotation) => {
          let tags = annotation.tags
          return !(tags.length > 0 && _.find(filteringTags, tags[0])) || (tags.length > 1 && _.find(filteringTags, tags[1]))
        })
        // Redraw all annotations
        this.redrawAnnotations()
        LanguageUtils.dispatchCustomEvent(Events.updatedAllAnnotations, {annotations: this.allAnnotations})
        if (_.isFunction(callback)) {
          callback(null, this.allAnnotations)
        }
      }
    })
  }

  retrieveCurrentAnnotations () {
    return this.allAnnotations
  }

  highlightAnnotations (annotations, callback) {
    let promises = []
    annotations.forEach(annotation => {
      promises.push(new Promise((resolve) => {
        this.highlightAnnotation(annotation, resolve)
      }))
    })
    Promise.all(promises).then(() => {
      if (_.isFunction(callback)) {
        callback()
      }
    })
  }

  highlightAnnotation (annotation, callback) {
    let classNameToHighlight = this.retrieveHighlightClassName(annotation)
    // Get annotation color for an annotation
    let tagInstance = window.abwa.tagManager.findAnnotationTagInstance(annotation)
    if (tagInstance) {
      let color = tagInstance.getColor()
      try {
        let highlightedElements = []
        highlightedElements = DOMTextUtils.highlightContent(
          annotation.target[0].selector, classNameToHighlight, annotation.id)
        // Highlight in same color as button
        highlightedElements.forEach(highlightedElement => {
          // If need to highlight, set the color corresponding to, in other case, maintain its original color
          $(highlightedElement).css('background-color', color)
          // Set purpose color
          highlightedElement.dataset.color = color
          let group = null
          if (LanguageUtils.isInstanceOf(tagInstance, TagGroup)) {
            group = tagInstance
            // Set message
            highlightedElement.title = group.config.name + '\nLevel is pending, please right click to set a level.'
          } else if (LanguageUtils.isInstanceOf(tagInstance, Tag)) {
            group = tagInstance.group
            highlightedElement.title = group.config.name + '\nLevel: ' + tagInstance.name
          }
          if (!_.isEmpty(annotation.text)) {
            try {
              let feedback = JSON.parse(annotation.text)
              highlightedElement.title += '\nFeedback: ' + feedback.comment
            } catch (e) {
              highlightedElement.title += '\nFeedback: ' + annotation.text
            }
          }
        })
        // Create context menu event for highlighted elements
        this.createContextMenuForAnnotation(annotation)
        // Create click event to move to next annotation
        // Create double click event handler
        this.createDoubleClickEventHandler(annotation)
      } catch (e) {
        // TODO Handle error (maybe send in callback the error ¿?)
        if (_.isFunction(callback)) {
          callback(new Error('Element not found'))
        }
      } finally {
        if (_.isFunction(callback)) {
          callback()
        }
      }
    }
  }

  createDoubleClickEventHandler (annotation) {
    let highlights = document.querySelectorAll('[data-annotation-id="' + annotation.id + '"]')
    for (let i = 0; i < highlights.length; i++) {
      let highlight = highlights[i]
      highlight.addEventListener('dblclick', () => {
        this.commentAnnotationHandler(annotation)
      })
    }
  }

  createContextMenuForAnnotation (annotation) {
    let paragraph
    let groupTag = window.abwa.tagManager.getGroupFromAnnotation(annotation)
    let criterionName = groupTag.config.name
    let selectors = annotation.target[0].selector
    let fragmentTextSelector
    if (selectors) {
      fragmentTextSelector = selectors.find((selector) => {
        return selector.type === 'TextQuoteSelector'
      })
    }
    if (fragmentTextSelector) {
      paragraph = fragmentTextSelector.exact.replace(/(\r\n|\n|\r)/gm, '')
    }
    $.contextMenu({
      selector: '[data-annotation-id="' + annotation.id + '"]',
      build: () => {
        // Create items for context menu
        let items = {}
        items['comment'] = {name: 'View correction'}
        items['delete'] = {name: 'Delete'}
        return {
          callback: (key) => {
            if (key === 'delete') {
              this.deleteAnnotationHandler(annotation)
            } else if (key === 'comment') {
              this.commentAnnotationHandler(annotation)
            } else if (key === 'clarify') {
              // this.commentAnnotationHandler(annotation)
              Alerts.inputTextAlert({
                title: 'Clarify by LLM',
                inputPlaceholder: 'Your question',
                preConfirm: () => {
                  return new Promise((resolve) => {
                    let question = document.querySelector('.swal2-input').value
                    if (question && question.length > 3) {
                      resolve(question)
                    } else {
                      Alerts.errorAlert({text: 'Please enter a question'})
                    }
                  })
                },
                callback: () => {
                  let question = document.querySelector('.swal2-input').value
                  TextAnnotator.askQuestionClarify(paragraph, question, criterionName, annotation, '')
                }
              })
            } else if (key === 'factChecking') {
              // this.commentAnnotationHandler(annotation)
              // let question = document.querySelector('#swal-criterionQuestion').value
              TextAnnotator.askQuestionFactChecking(paragraph, criterionName, annotation)
            } else if (key === 'socialJudge') {
              // this.commentAnnotationHandler(annotation)
              TextAnnotator.askQuestionSocialJudge(paragraph, criterionName, annotation)
            }
          },
          items: items
        }
      }
    })
  }

  deleteAnnotationHandler (annotation) {
    // Ask for confirmation
    Alerts.confirmAlert({
      alertType: Alerts.alertType.question,
      title: 'Delete annotation',
      text: 'Are you sure you want to delete this annotation?',
      callback: () => {
        // Delete annotation
        window.abwa.storageManager.client.deleteAnnotation(annotation.id, (err, result) => {
          if (err) {
            // Unable to delete this annotation
            Alerts.errorAlert({text: 'Error while trying to delete annotation. Error: ' + err.message})
          } else {
            if (!result.deleted) {
              // Alert user error happened
              Alerts.errorAlert({text: chrome.i18n.getMessage('errorDeletingAnnotation')})
            } else {
              _.remove(this.allAnnotations, (currentAnnotation) => {
                return currentAnnotation.id === annotation.id
              })
              LanguageUtils.dispatchCustomEvent(Events.updatedAllAnnotations, {annotations: this.allAnnotations})
              // Dispatch deleted annotation event
              LanguageUtils.dispatchCustomEvent(Events.annotationDeleted, {annotation: annotation})
              // Unhighlight annotation highlight elements
              DOMTextUtils.unHighlightElements([...document.querySelectorAll('[data-annotation-id="' + annotation.id + '"]')])
            }
          }
        })
      }
    })
  }

  commentAnnotationHandler (annotation) {
    // Close sidebar if opened
    let isSidebarOpened = window.abwa.sidebar.isOpened()
    this.closeSidebar()
    // Open sweetalert
    // let that = this
    let paragraph

    let updateAnnotation = (comment, level, form) => {
      form.comment = comment
      form.level = level
      annotation.text = JSON.stringify(form)

      // Assign level to annotation
      if (level != null) {
        let tagGroup = window.abwa.tagManager.getGroupFromAnnotation(annotation)
        let pole = tagGroup.tags.find((e) => { return e.name === level })
        annotation.tags = pole.tags
      }

      LanguageUtils.dispatchCustomEvent(Events.updateAnnotation, {annotation: annotation})

      if (isSidebarOpened) {
        window.abwa.contentAnnotator.openSidebar()
      }
    }
    let showAlert = (form) => {
      let hasLevel = (annotation, level) => {
        return annotation.tags.find((e) => { return e === Config.review.namespace + ':' + Config.review.tags.grouped.subgroup + ':' + level }) != null
      }
      let selectors = annotation.target[0].selector
      let fragmentTextSelector
      if (selectors) {
        fragmentTextSelector = selectors.find((selector) => {
          return selector.type === 'TextQuoteSelector'
        })
      }
      if (fragmentTextSelector) {
        paragraph = fragmentTextSelector.exact.replace(/(\r\n|\n|\r)/gm, '')
      }
      let groupTag = window.abwa.tagManager.getGroupFromAnnotation(annotation)
      let exerciseName
      if (form.llm) {
        exerciseName = 'Exercise:' + groupTag.config.name + ' [highlighted by ' + form.llm + ']'
      } else {
        exerciseName = ':' + groupTag.config.name
      }
      let poles = groupTag.tags.map((e) => { return e.name })
      // let poleChoiceRadio = poles.length>0 ? '<h3>Pole</h3>' : ''
      let poleChoiceRadio = '<div>'
      poles.forEach((e) => {
        poleChoiceRadio += '<input type="radio" name="pole" class="swal2-radio poleRadio" value="' + e + '" '
        if (hasLevel(annotation, e)) poleChoiceRadio += 'checked'
        poleChoiceRadio += '>'
        switch (e) {
          case 'Strength':
            poleChoiceRadio += '<img class="poleImage" alt="Strength" title="Mark as a strength" width="20" src="' + chrome.runtime.getURL('images/strength.png') + '"/>'
            break
          case 'Major weakness':
            poleChoiceRadio += '<img class="poleImage" alt="Major concern" title="Mark as a major concern" width="20" src="' + chrome.runtime.getURL('images/majorConcern.png') + '"/>'
            break
          case 'Minor weakness':
            poleChoiceRadio += '<img class="poleImage" alt="Minor concern" title="Mark as a minor concern" width="20" src="' + chrome.runtime.getURL('images/minorConcern.png') + '"/>'
            break
        }
        poleChoiceRadio += ' <span class="swal2-label" style="margin-right:5%;" title="\'+e+\'">' + e + '</span>'
      })
      poleChoiceRadio += '</div>'
      let factChecking = ''
      let socialJudge = ''
      let clarifications = ''
      let IAComment = ''
      let userCommentHTML = ''
      if (form.comment) {
        IAComment = form.comment
      }
      userCommentHTML = '<br/><span>Comment:</span><br/>' + '<textarea rows="4" cols="40" id="swal-textarea">' + IAComment + '</textarea>'
      if (form.clarifications) {
        let clarificationsQuestions = form.clarifications
        clarificationsQuestions.forEach((e) => {
          clarifications += '<br/><span>' + e.question.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span><br/>'
          clarifications += '<textarea readonly rows="4" cols="40">' + e.answer + '</textarea>'
        })
      }
      if (form.factChecking) {
        factChecking = '<br/><span>Fact checking:</span><br/>' + '<textarea readonly rows="4" cols="40" id="swal-textarea-factChecking">' + form.factChecking + '</textarea>'
      }
      if (form.socialJudge) {
        socialJudge = '<br/><span>Social Judge:</span><br/>' + '<textarea readonly rows="4" cols="40" id="swal-textarea-socialJudge">' + form.socialJudge + '</textarea>'
      }
      TextAnnotator.tryToLoadSwal()
      if (_.isNull(swal)) {
        console.log('Unable to load swal')
      } else {
        swal.fire({
          html: '<h3 class="exerciseName">' + exerciseName + '</h3>' + poleChoiceRadio + userCommentHTML + clarifications + factChecking + socialJudge,
          showLoaderOnConfirm: true,
          width: '40em',
          didRender: () => {
            // Crear el botón "Clarify Comment"
            const clarifyCButton = document.createElement('button')
            clarifyCButton.innerText = 'Clarify Comment'
            clarifyCButton.classList.add('swal2-confirm', 'swal2-styled') // Asegurarse de que tenga el mismo estilo
            clarifyCButton.onclick = () => {
              swal.close()
              Alerts.inputTextAlert({
                title: 'Clarify by LLM',
                inputPlaceholder: 'Your question',
                preConfirm: () => {
                  return new Promise((resolve) => {
                    let question = document.querySelector('.swal2-input').value
                    if (question && question.length > 3) {
                      resolve(question)
                    } else {
                      Alerts.errorAlert({text: 'Please enter a question'})
                    }
                  })
                },
                callback: () => {
                  let question = document.querySelector('.swal2-input').value
                  TextAnnotator.askQuestionClarify(paragraph, question, exerciseName, annotation, IAComment)
                }
              })
            }
            // Crear el botón "Clarify Question"
            let selectedClarification
            const clarifyQButton = document.createElement('button')
            clarifyQButton.innerText = 'Clarify Question'
            clarifyQButton.classList.add('swal2-confirm', 'swal2-styled')
            clarifyQButton.onclick = () => {
              let clarificationsQuestions = form.clarifications
              let clarificationsHTML = '<div>'
              // Construir el HTML para mostrar las preguntas de aclaración
              clarificationsQuestions.forEach((clarification, index) => {
                clarificationsHTML += `
                  <div>
                    <input type="radio" name="clarification" id="comment" value="${index}">
                    <label for="comment">${clarification.question}</label>
                    <br>
                    <textarea readonly rows="4" cols="40">${clarification.answer}</textarea>
                  </div>
                `
              })
              clarificationsHTML += '</div>'
              // Mostrar una ventana emergente con las preguntas de aclaración
              swal.fire({
                title: 'Select Clarification',
                html: clarificationsHTML,
                width: '40em',
                showCancelButton: true,
                cancelButtonText: 'Cancel',
                confirmButtonText: 'Select',
                preConfirm: () => {
                  // Obtener la pregunta de aclaración seleccionada
                  let selectedClarificationIndex = document.querySelector('input[name="clarification"]:checked').value
                  let selectedClarification = clarificationsQuestions[selectedClarificationIndex]
                  return selectedClarification
                }
              }).then((result) => {
                // Si el usuario confirma la selección, puedes hacer algo aquí
                if (result.isConfirmed) {
                  selectedClarification = result.value               
                  // Cerrar la ventana emergente
                  swal.close()
                  // this.commentAnnotationHandler(annotation
                  let commentClasification = selectedClarification.question + ': ' + selectedClarification.answer
                  Alerts.inputTextAlert({
                    title: 'Clarify by LLM',
                    inputPlaceholder: 'Your question',
                    preConfirm: () => {
                      return new Promise((resolve) => {
                        let question = document.querySelector('.swal2-input').value
                        if (question && question.length > 3) {
                          resolve(question)
                        } else {
                          Alerts.errorAlert({text: 'Please enter a question'})
                        }
                      })
                    },
                    callback: () => {
                      let question = document.querySelector('.swal2-input').value
                      TextAnnotator.askQuestionClarify(paragraph, question, exerciseName, annotation, commentClasification)
                    }
                  })
                }
              })
            }
            document.querySelector('.swal2-actions').appendChild(clarifyCButton)
            if (form.clarifications) {
              document.querySelector('.swal2-actions').appendChild(clarifyQButton)
            }
          },
          preConfirm: () => {
            let newComment = $('#swal-textarea').val()
            let level = $('.poleRadio:checked') != null && $('.poleRadio:checked').length === 1 ? $('.poleRadio:checked')[0].value : null
            updateAnnotation(newComment, level, form)
          }
        })
      }
      if (!form.llm) {
        $('.poleRadio + img').on('click', function () {
          $(this).prev('.poleRadio').prop('checked', true)
        })
      }
    }
    if (annotation.text === null || annotation.text === '') {
      showAlert({comment: ''})
    } else {
      showAlert(JSON.parse(annotation.text))
    }
  }

  static askQuestionClarify (excerpt, question, criterion, annotation, comment) {
    chrome.runtime.sendMessage({ scope: 'llm', cmd: 'getSelectedLLM' }, async ({ llm }) => {
      if (llm === '') {
        llm = Config.review.defaultLLM
      }
      if (llm && llm !== '') {
        let selectedLLM = llm
        chrome.runtime.sendMessage({ scope: 'prompt', cmd: 'getPrompt', data: {type: 'clarifyPrompt'} }, ({ prompt }) => {
          let clarifyPrompt
          if (prompt) {
            clarifyPrompt = prompt
          } else {
            clarifyPrompt = Config.prompts.clarifyPrompt
          }
          criterion = criterion.replace(/\[.*?\]/g, '')
          clarifyPrompt = clarifyPrompt.replaceAll('[C_EXCERPT]', excerpt).replaceAll('[C_NAME]', criterion).replaceAll('[C_QUESTION]', question).replaceAll('[C_COMMENT]', comment)
          Alerts.confirmAlert({
            title: 'Clarification',
            text: '<div style="text-align: justify;text-justify: inter-word">You are going to ask the following question:\n ' + clarifyPrompt + '</div>',
            cancelButtonText: 'Cancel',
            callback: async () => {
              let documents = []
              documents = await LLMTextUtils.loadDocument()
              chrome.runtime.sendMessage({
                scope: 'llm',
                cmd: 'getAPIKEY',
                data: selectedLLM
              }, ({ apiKey }) => {
                let callback = (json) => {
                  let answer = json.answer
                  Alerts.answerTextFragmentAlert({
                    answer: answer,
                    excerpt: excerpt,
                    question: question,
                    criterion: criterion,
                    type: 'clarification',
                    annotation: annotation
                  })
                }
                if (apiKey && apiKey !== '') {
                  let params = {
                    criterion: criterion,
                    apiKey: apiKey,
                    documents: documents,
                    callback: callback,
                    prompt: clarifyPrompt
                  }
                  if (selectedLLM === 'anthropic') {
                    AnthropicManager.askCriteria(params)
                  } else if (selectedLLM === 'openAI') {
                    OpenAIManager.askCriteria(params)
                  }
                } else {
                  let callback = () => {
                    window.open(chrome.runtime.getURL('pages/options.html'))
                  }
                  Alerts.infoAlert({
                    text: 'Please, configure your LLM.',
                    title: 'Please select a LLM and provide your API key',
                    callback: callback()
                  })
                }
              })
            }
          })
        })
      }
    })
  }

  static askQuestionFactChecking (excerpt, criterion, annotation) {
    chrome.runtime.sendMessage({ scope: 'llm', cmd: 'getSelectedLLM' }, async ({ llm }) => {
      if (llm === '') {
        llm = Config.review.defaultLLM
      }
      if (llm && llm !== '') {
        let selectedLLM = llm
        chrome.runtime.sendMessage({ scope: 'prompt', cmd: 'getPrompt', data: {type: 'factCheckingPrompt'} }, ({ prompt }) => {
          let factCheckingPrompt
          if (prompt) {
            factCheckingPrompt = prompt
          } else {
            factCheckingPrompt = Config.prompts.factCheckingPrompt
          }
          factCheckingPrompt = factCheckingPrompt.replaceAll('[C_EXCERPT]', excerpt)
          Alerts.confirmAlert({
            title: 'Fact Checking',
            text: '<div style="text-align: justify;text-justify: inter-word">You are going to ask the following question:\n ' + factCheckingPrompt + '</div>',
            cancelButtonText: 'Cancel',
            callback: async () => {
              let documents = []
              documents = await LLMTextUtils.loadDocument()
              chrome.runtime.sendMessage({
                scope: 'llm',
                cmd: 'getAPIKEY',
                data: selectedLLM
              }, ({ apiKey }) => {
                let callback = (json) => {
                  let answer = json.answer
                  Alerts.answerTextFragmentAlert({
                    answer: answer,
                    excerpt: excerpt,
                    criterion: criterion,
                    type: 'factChecking',
                    annotation: annotation
                  })
                }
                if (apiKey && apiKey !== '') {
                  let params = {
                    criterion: criterion,
                    apiKey: apiKey,
                    documents: documents,
                    callback: callback,
                    prompt: factCheckingPrompt
                  }
                  if (selectedLLM === 'anthropic') {
                    AnthropicManager.askCriteria(params)
                  } else if (selectedLLM === 'openAI') {
                    OpenAIManager.askCriteria(params)
                  }
                } else {
                  let callback = () => {
                    window.open(chrome.runtime.getURL('pages/options.html'))
                  }
                  Alerts.infoAlert({
                    text: 'Please, configure your LLM.',
                    title: 'Please select a LLM and provide your API key',
                    callback: callback()
                  })
                }
              })
            }
          })
        })
      }
    })
  }

  static askQuestionSocialJudge (excerpt, criterion, annotation) {
    chrome.runtime.sendMessage({ scope: 'llm', cmd: 'getSelectedLLM' }, async ({ llm }) => {
      if (llm === '') {
        llm = Config.review.defaultLLM
      }
      if (llm && llm !== '') {
        let selectedLLM = llm
        chrome.runtime.sendMessage({ scope: 'prompt', cmd: 'getPrompt', data: {type: 'socialJudgePrompt'} }, ({ prompt }) => {
          let socialJudgePrompt
          if (prompt) {
            socialJudgePrompt = prompt
          } else {
            socialJudgePrompt = Config.prompts.socialJudgePrompt
          }
          socialJudgePrompt = socialJudgePrompt.replaceAll('[C_EXCERPT]', excerpt)
          Alerts.confirmAlert({
            title: 'Social Judge',
            text: '<div style="text-align: justify;text-justify: inter-word">You are going to ask the following question:\n ' + socialJudgePrompt + '</div>',
            cancelButtonText: 'Cancel',
            callback: async () => {
              let documents = []
              documents = await LLMTextUtils.loadDocument()
              chrome.runtime.sendMessage({
                scope: 'llm',
                cmd: 'getAPIKEY',
                data: selectedLLM
              }, ({ apiKey }) => {
                let callback = (json) => {
                  let answer = json.answer
                  Alerts.answerTextFragmentAlert({
                    answer: answer,
                    excerpt: excerpt,
                    criterion: criterion,
                    type: 'socialJudge',
                    annotation: annotation
                  })
                }
                if (apiKey && apiKey !== '') {
                  let params = {
                    criterion: criterion,
                    apiKey: apiKey,
                    documents: documents,
                    callback: callback,
                    prompt: socialJudgePrompt
                  }
                  if (selectedLLM === 'anthropic') {
                    AnthropicManager.askCriteria(params)
                  } else if (selectedLLM === 'openAI') {
                    OpenAIManager.askCriteria(params)
                  }
                } else {
                  let callback = () => {
                    window.open(chrome.runtime.getURL('pages/options.html'))
                  }
                  Alerts.infoAlert({
                    text: 'Please, configure your LLM.',
                    title: 'Please select a LLM and provide your API key',
                    callback: callback()
                  })
                }
              })
            }
          })
        })
      }
    })
  }

  retrieveHighlightClassName () {
    return this.highlightClassName // TODO Depending on the status of the application
  }

  mouseUpOnDocumentHandlerConstructor () {
    return (event) => {
      // Check if something is selected
      if (document.getSelection().toString().length !== 0) {
        if ($(event.target).parents('#abwaSidebarWrapper').toArray().length === 0 &&
          $(event.target).parents('.swal2-container').toArray().length === 0 &&
          $(event.target).parents('#canvasContainer').toArray().length === 0
        ) {
          this.openSidebar()
        }
      } else {
        // If selection is child of sidebar, return null
        if ($(event.target).parents('#abwaSidebarWrapper').toArray().length === 0 &&
          event.target.id !== 'context-menu-layer') {
          this.closeSidebar()
        }
      }
    }
  }

  goToNextAnnotationOfTag (tag) {
    // Get all the annotations with that tag
    let annotations = window.abwa.contentAnnotator.allAnnotations.filter(annotation => annotation.tags.includes(tag))
    let index = _.indexOf(annotations, this.lastAnnotation)
    if (index === -1 || index === annotations.length - 1) {
      this.lastAnnotation = annotations[0]
    } else {
      this.lastAnnotation = annotations[index + 1]
    }
    window.abwa.contentAnnotator.goToAnnotation(this.lastAnnotation)
    window.abwa.sidebar.openSidebar()
  }

  goToAnnotation (annotation) {
    // If document is pdf, the DOM is dynamic, we must scroll to annotation using PDF.js FindController
    if (window.abwa.contentTypeManager.documentType === ContentTypeManager.documentTypes.pdf) {
      let queryTextSelector = _.find(annotation.target[0].selector, (selector) => { return selector.type === 'TextQuoteSelector' })
      if (queryTextSelector && queryTextSelector.exact) {
        // Get page for the annotation
        let fragmentSelector = _.find(annotation.target[0].selector, (selector) => { return selector.type === 'FragmentSelector' })
        if (fragmentSelector && fragmentSelector.page) {
          // Check if annotation was found by 'find' command, otherwise go to page
          if (window.PDFViewerApplication.page !== fragmentSelector.page) {
            window.PDFViewerApplication.page = fragmentSelector.page
            this.redrawAnnotations()
          }
        }
        window.PDFViewerApplication.findController.executeCommand('find', {query: queryTextSelector.exact, phraseSearch: true})
        // Timeout to remove highlight used by PDF.js
        this.removeFindTagsInPDFs()
      }
    } else { // Else, try to find the annotation by data-annotation-id element attribute
      let firstElementToScroll = document.querySelector('[data-annotation-id="' + annotation.id + '"]')
      // If go to annotation is done by init annotation and it is not found, wait for some seconds for ajax content to be loaded and try again to go to annotation
      if (!_.isElement(firstElementToScroll) && !_.isNumber(this.initializationTimeout)) { // It is done only once, if timeout does not exist previously (otherwise it won't finish never calling goToAnnotation
        this.initializationTimeout = setTimeout(() => {
          this.initAnnotatorByAnnotation()
        }, 2000)
      } else {
        firstElementToScroll.scrollIntoView({behavior: 'smooth', block: 'center'})
      }
    }
  }

  closeSidebar () {
    super.closeSidebar()
  }

  openSidebar () {
    super.openSidebar()
  }

  destroy () {
    // Remove observer interval
    clearInterval(this.observerInterval)
    // Clean interval
    clearInterval(this.cleanInterval)
    // Remove reload interval
    clearInterval(this.reloadInterval)
    // Remove event listeners
    let events = _.values(this.events)
    for (let i = 0; i < events.length; i++) {
      events[i].element.removeEventListener(events[i].event, events[i].handler)
    }
    // Unhighlight all annotations
    this.unHighlightAllAnnotations()
  }

  unHighlightAllAnnotations () {
    // Remove created annotations
    let highlightedElements = [...document.querySelectorAll('[data-annotation-id]')]
    DOMTextUtils.unHighlightElements(highlightedElements)
  }

  initAnnotatorByAnnotation (callback) {
    // Check if init annotation exists
    if (window.abwa.annotationBasedInitializer.initAnnotation) {
      let initAnnotation = window.abwa.annotationBasedInitializer.initAnnotation
      // If document is pdf, the DOM is dynamic, we must scroll to annotation using PDF.js FindController
      if (window.abwa.contentTypeManager.documentType === ContentTypeManager.documentTypes.pdf) {
        let queryTextSelector = _.find(initAnnotation.target[0].selector, (selector) => { return selector.type === 'TextQuoteSelector' })
        if (queryTextSelector && queryTextSelector.exact) {
          window.PDFViewerApplication.findController.executeCommand('find', {query: queryTextSelector.exact, phraseSearch: true})
        }
      } else { // Else, try to find the annotation by data-annotation-id element attribute
        let firstElementToScroll = document.querySelector('[data-annotation-id="' + initAnnotation.id + '"]')
        if (!_.isElement(firstElementToScroll) && !_.isNumber(this.initializationTimeout)) {
          this.initializationTimeout = setTimeout(() => {
            this.initAnnotatorByAnnotation()
          }, 2000)
        } else {
          if (_.isElement(firstElementToScroll)) {
            firstElementToScroll.scrollIntoView({behavior: 'smooth', block: 'center'})
          } else {
            // Unable to go to the annotation
          }
        }
      }
    }
    if (_.isFunction(callback)) {
      callback()
    }
  }

  /**
   * Giving a list of old tags it changes all the annotations for the current document to the new tags
   * @param oldTags
   * @param newTags
   * @param callback Error, Result
   */
  updateTagsForAllAnnotationsWithTag (oldTags, newTags, callback) {
    // Get all annotations with oldTags
    let oldTagsAnnotations = _.filter(this.allAnnotations, (annotation) => {
      let tags = annotation.tags
      return oldTags.every((oldTag) => {
        return tags.includes(oldTag)
      })
    })
    let promises = []
    for (let i = 0; i < oldTagsAnnotations.length; i++) {
      let oldTagAnnotation = oldTagsAnnotations[i]
      promises.push(new Promise((resolve, reject) => {
        oldTagAnnotation.tags = newTags
        window.abwa.storageManager.client.updateAnnotation(oldTagAnnotation.id, oldTagAnnotation, (err, annotation) => {
          if (err) {
            reject(new Error('Unable to update annotation ' + oldTagAnnotation.id))
          } else {
            resolve(annotation)
          }
        })
      }))
    }
    let annotations = []
    Promise.all(promises).then((result) => {
      // All annotations updated
      annotations = result
    }).finally((result) => {
      if (_.isFunction(callback)) {
        callback(null, annotations)
      }
    })
  }

  redrawAnnotations () {
    // Unhighlight all annotations
    this.unHighlightAllAnnotations()
    // Highlight all annotations
    this.highlightAnnotations(this.allAnnotations)
  }

  deleteAllAnnotations () {
    // Retrieve all the annotations
    let allAnnotations = this.allAnnotations
    // Delete all the annotations
    let promises = []
    for (let i = 0; i < allAnnotations.length; i++) {
      promises.push(new Promise((resolve, reject) => {
        window.abwa.storageManager.client.deleteAnnotation(allAnnotations[i].id, (err) => {
          if (err) {
            reject(new Error('Unable to delete annotation id: ' + allAnnotations[i].id))
          } else {
            resolve()
          }
        })
        return true
      }))
    }
    // When all the annotations are deleted
    Promise.all(promises).catch(() => {
      Alerts.errorAlert({text: 'There was an error when trying to delete all the annotations, please reload and try it again.'})
    }).then(() => {
      // Update annotation variables
      this.allAnnotations = []
      // Dispatch event and redraw annotations
      LanguageUtils.dispatchCustomEvent(Events.updatedAllAnnotations, {annotations: this.allAnnotations})
      this.redrawAnnotations()
    })
  }

  removeFindTagsInPDFs () {
    setTimeout(() => {
      // Remove class for middle selected elements in find function of PDF.js
      document.querySelectorAll('.highlight.selected.middle').forEach(elem => {
        $(elem).removeClass('highlight selected middle')
      })
      // Remove wrap for begin and end selected elements in find function of PDF.js
      document.querySelectorAll('.highlight.selected').forEach(elem => {
        if (elem.children.length === 1) {
          $(elem.children[0]).unwrap()
        } else {
          $(document.createTextNode(elem.innerText)).insertAfter(elem)
          $(elem).remove()
        }
      })
    }, 1000)
  }

  static findTagForSentiment (sentiment) {
    sentiment = sentiment.toLowerCase()
    if (sentiment === 'not met') {
      return 'review:level:Major weakness'
    } else if (sentiment === 'partially met') {
      return 'review:level:Minor weakness'
    } else if (sentiment === 'met') {
      return 'review:level:Strength'
    }
  }

  static tryToLoadSwal () {
    if (_.isNull(swal)) {
      try {
        swal = require('sweetalert2')
      } catch (e) {
        swal = null
      }
    }
  }

  updateAnnotationEventHandler () {
    return (event) => {
      // Get annotation to update
      const annotation = event.detail.annotation
      // Send updated annotation to the server
      window.abwa.storageManager.client.updateAnnotation(
        annotation.id,
        annotation,
        (err, annotation) => {
          if (err) {
            // Show error message
            Alerts.errorAlert({ text: chrome.i18n.getMessage('errorUpdatingAnnotationComment') })
          } else {
            // Update current annotations
            let currentIndex = _.findIndex(window.abwa.contentAnnotator.allAnnotations, (currentAnnotation) => { return annotation.id === currentAnnotation.id })
            window.abwa.contentAnnotator.allAnnotations.splice(currentIndex, 1, annotation)
            // Update all annotations
            let allIndex = _.findIndex(window.abwa.contentAnnotator.allAnnotations, (currentAnnotation) => { return annotation.id === currentAnnotation.id })
            window.abwa.contentAnnotator.allAnnotations.splice(allIndex, 1, annotation)
            // Dispatch updated annotations events
            LanguageUtils.dispatchCustomEvent(Events.updatedAllAnnotations, { annotations: window.abwa.contentAnnotator.allAnnotations })

            LanguageUtils.dispatchCustomEvent(Events.comment, { annotation: annotation })

            DOMTextUtils.unHighlightElements([...document.querySelectorAll('[data-annotation-id="' + annotation.id + '"]')])
            window.abwa.contentAnnotator.highlightAnnotation(annotation)
          }
        })
    }
  }

  updateTagAnnotationEventHandler () {
    return (event) => {
      // Get annotation to update
      const annotation = event.detail.annotation
      // Send updated annotation to the server
      window.abwa.storageManager.client.updateAnnotation(
        annotation.id,
        annotation,
        (err, annotation) => {
          if (err) {
            // Show error message
            Alerts.errorAlert({text: chrome.i18n.getMessage('errorUpdatingAnnotationComment')})
          } else {
            // Dispatch updated annotations events
            // LanguageUtils.dispatchCustomEvent(Events.updatedAllAnnotations, {annotations: window.abwa.contentAnnotator.allAnnotations})
            window.abwa.tagManager.reloadTags()
          }
        })
    }
  }
}

export default TextAnnotator
