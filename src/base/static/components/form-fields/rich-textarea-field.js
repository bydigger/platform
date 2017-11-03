import React, { Component } from "react";
import cx from "bem-classnames";
import ReactQuill, { Quill } from "react-quill";
const BlockEmbed = Quill.import("blots/block/embed");
const SnowTheme = Quill.import("themes/snow");
const Link = Quill.import("formats/link");

const Util = require("../../js/utils.js");

const baseClass = "mapseed-rich-textarea-field";

// NOTE: this routine is taken from Quill's themes/base module.
const extractVideoUrl = (url) => {
  let match = url.match(/^(?:(https?):\/\/)?(?:(?:www|m)\.)?youtube\.com\/watch.*v=([a-zA-Z0-9_-]+)/) ||
              url.match(/^(?:(https?):\/\/)?(?:(?:www|m)\.)?youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return (match[1] || 'https') + '://www.youtube.com/embed/' + match[2] + '?showinfo=0';
  }
  if (match = url.match(/^(?:(https?):\/\/)?(?:www\.)?vimeo\.com\/(\d+)/)) {
    return (match[1] || 'https') + '://player.vimeo.com/video/' + match[2] + '/';
  }
  return url;
};

class WrappedVideo extends BlockEmbed {

  static create(url) {
    let node = super.create();
    const iframe = document.createElement("iframe");
    
    url = Link.sanitize(extractVideoUrl(url));
    iframe.setAttribute("src", url);
    iframe.setAttribute("frameborder", 0);
    iframe.setAttribute("allowfullscreen", true);
    iframe.className = "ql-video";
    node.appendChild(iframe);
    
    return node;
  }
};
WrappedVideo.blotName = "wrappedVideo";
WrappedVideo.tagName = "DIV";
WrappedVideo.className = "ql-video-container";
Quill.register(WrappedVideo);

class RichTextareaField extends Component {

  constructor() {
    super(...arguments);
    this.modules = {
      toolbar: {
        container: [
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ header: [1, 2, 3, 4, 5, 6, false] }],
          [{ color: [] }, { background: [] }],
          ["link", "image", "video"],
        ],
        handlers: {
          "image": this.onClickEmbedImage.bind(this),
          "video": this.onClickEmbedVideo.bind(this)
        }
      }
    };
  }

  onClickEmbedImage() {
    this.refs["quill-file-input"].click();
  }

  onClickEmbedVideo(evt) {
    this.snowTheme.tooltip.edit("video");
  }

  componentDidMount() {

    let editor = this.refs["quill-editor"].getEditor();

    // NOTE: we create a whole new SnowTheme here so we can make use of a
    // tooltip box with custom click handler.
    // TODO: is there a lighter-weight way to accomplish this?
    this.snowTheme = new SnowTheme(editor, editor.options);
    this.snowTheme.extendToolbar(editor.theme.modules.toolbar);

    // We replace the ql-action element so we can attach our own click listener
    // below.
    let oldElt = this.snowTheme.tooltip.root.querySelector("a.ql-action"),
        newElt = oldElt.cloneNode(true);
    oldElt.parentNode.replaceChild(newElt, oldElt);

    this.snowTheme.tooltip.root
      .querySelector("a.ql-action")
      .addEventListener("click", (evt) => {
        evt.preventDefault();
        editor.focus();
        let url = this.snowTheme.tooltip.root.querySelector("input").value;
        editor.insertEmbed(
          editor.getSelection().index, 
          "wrappedVideo", 
          url, 
          "user"
        );
        this.snowTheme.tooltip.root.className += " ql-hidden";
      });
  }

  onAddImage(evt) {

    // TODO: model/no model distinction here (i.e. form vs editor)
    if (evt.target.files && evt.target.files.length) {
      let file = evt.target.files[0];
      Util.fileToCanvas(
        file,
        (canvas) => {
          canvas.toBlob((blob) => {
            let data = {
              name: Math.random().toString(36).substring(7),
              blob: blob,
              file: canvas.toDataURL("image/jpeg"),
            },
            editor = this.refs["quill-editor"].getEditor();
              
            editor.insertEmbed(
              editor.getSelection().index,
              "image",
              data.file,
              "user",
            );

            // Store attachment image data in the input form for processing later.
            this.props.onAddImage(data);

            // if (self.options.placeDetailView) {
            //   // If we have a place detail view, we already have a model to which
            //   // we can add attachments
            //   self.options.placeDetailView.onAddAttachmentCallback =
            //     self.onAddAttachment;
            //   self.options.placeDetailView.onAddAttachmentCallbackContext = self;
            //   self.model.attachmentCollection.add(data);
            // } else if (self.options.placeFormView) {
            //   // Otherwise, store up the added attachments in the place form view
            //   self.options.placeFormView.formState.attachmentData.push(data);
            //   self.quill.insertEmbed(
            //     self.quill.getSelection().index,
            //     "image",
            //     data.file,
            //     "user",
            //   );
            //   self
            //     .$("img")
            //     .filter(function() {
            //       return !$(this).attr("name");
            //     })
            //     .last()
            //     .attr("name", data.name);
            // }
          }, "image/jpeg");
        },
        {
          // TODO: make configurable
          maxWidth: 800,
          maxHeight: 800,
          canvas: true,
        },
      );
    }

    // NOTE: we reset the value of the file input field here so the user can
    // add multiple images to the rich text editor. If we don't reset the value,
    // the input field's onChange handler will only fire after the first image
    // is added.
    this.refs["quill-file-input"].value = "";
  }

  render() {
    let quillFileInputClass = {
          name: baseClass + "__quill-file-input",
          modifiers: ["visibility"]
        };

    return (
      <div className={baseClass}>
        <ReactQuill 
          ref="quill-editor"
          theme="snow"
          modules={this.modules}
          placeholder={this.props.placeholder}
          value={this.props.value}
          bounds={this.props.bounds}
          onChange={(value) => this.props.onChange(value, this.props.name)}>
        </ReactQuill>
        <input 
          className={cx(quillFileInputClass, { visibility: "hidden" })}
          ref="quill-file-input"
          type="file" 
          onChange={this.onAddImage.bind(this)}
          accept="image/png, image/gif, image/jpeg" />
      </div>
    );
  }
};

export { RichTextareaField };