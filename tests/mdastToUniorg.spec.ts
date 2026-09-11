import { describe, it, expect } from "vitest"
import { transformMdastToUniorgAst } from "../src/core/mdastToUniorg/index.js"
import type { Root as MdastRoot } from "mdast"

describe("transformMdastToUniorgAst", () => {
  it("should convert a simple heading and paragraph", () => {
    const mdast: MdastRoot = {
      type: "root",
      children: [
        {
          type: "heading",
          depth: 1,
          children: [{ type: "text", value: "Hello World" }]
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "This is a paragraph." }]
        }
      ]
    }

    const uniorgAst = transformMdastToUniorgAst(mdast)

    expect(uniorgAst).toMatchObject({
      type: "org-data",
      children: [
        {
          type: "headline",
          level: 1,
          children: [
            {
              type: "text",
              value: "Hello World"
            }
          ]
        },
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "This is a paragraph."
            }
          ]
        }
      ]
    })
  })

  it("should convert emphasis and strong text", () => {
    const mdast: MdastRoot = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "This is " },
            { type: "emphasis", children: [{ type: "text", value: "italic" }] },
            { type: "text", value: " and " },
            { type: "strong", children: [{ type: "text", value: "bold" }] },
            { type: "text", value: " text." }
          ]
        }
      ]
    }

    const uniorgAst = transformMdastToUniorgAst(mdast)

    expect(uniorgAst).toMatchObject({
      type: "org-data",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "This is " },
            { type: "italic", children: [{ type: "text", value: "italic" }] },
            { type: "text", value: " and " },
            { type: "bold", children: [{ type: "text", value: "bold" }] },
            { type: "text", value: " text." }
          ]
        }
      ]
    })
  })

  it("should convert a link", () => {
    const mdast: MdastRoot = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Visit " },
            {
              type: "link",
              url: "https://example.com",
              children: [{ type: "text", value: "Example" }]
            },
            { type: "text", value: "." }
          ]
        }
      ]
    }

    const uniorgAst = transformMdastToUniorgAst(mdast)

    expect(uniorgAst).toMatchObject({
      type: "org-data",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Visit " },
            {
              type: "link",
              format: "bracket",
              linkType: "url",
              path: "https://example.com",
              children: [{ type: "text", value: "Example" }]
            },
            { type: "text", value: "." }
          ]
        }
      ]
    })
  })

  it("should convert an unordered list", () => {
    const mdast: MdastRoot = {
      type: "root",
      children: [
        {
          type: "list",
          ordered: false,
          children: [
            {
              type: "listItem",
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "Item 1" }]
                }
              ]
            },
            {
              type: "listItem",
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "Item 2" }]
                }
              ]
            }
          ]
        }
      ]
    }

    const uniorgAst = transformMdastToUniorgAst(mdast)

    expect(uniorgAst).toMatchObject({
      type: "org-data",
      children: [
        {
          type: "plain-list",
          listType: "unordered",
          indent: 0,
          children: [
            {
              type: "list-item",
              indent: 0,
              bullet: "- ",
              counter: null,
              checkbox: null,
              children: [
                { type: "text", value: "Item 1" },
                { type: "text", value: "\n" }
              ]
            },
            {
              type: "list-item",
              indent: 0,
              bullet: "- ",
              counter: null,
              checkbox: null,
              children: [
                { type: "text", value: "Item 2" },
                { type: "text", value: "\n" }
              ]
            }
          ]
        }
      ]
    })
  })

  it("should convert an ordered list with checkboxes", () => {
    const mdast: MdastRoot = {
      type: "root",
      children: [
        {
          type: "list",
          ordered: true,
          start: 1,
          children: [
            {
              type: "listItem",
              checked: true,
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "Checked Item" }]
                }
              ]
            },
            {
              type: "listItem",
              checked: false,
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "Unchecked Item" }]
                }
              ]
            }
          ]
        }
      ]
    }

    const uniorgAst = transformMdastToUniorgAst(mdast)

    expect(uniorgAst).toMatchObject({
      type: "org-data",
      children: [
        {
          type: "plain-list",
          listType: "ordered",
          indent: 0,
          children: [
            {
              type: "list-item",
              indent: 0,
              bullet: "1. ",
              counter: null,
              checkbox: "on",
              children: [
                { type: "text", value: "Checked Item" },
                { type: "text", value: "\n" }
              ]
            },
            {
              type: "list-item",
              indent: 0,
              bullet: "2. ",
              counter: null,
              checkbox: "off",
              children: [
                { type: "text", value: "Unchecked Item" },
                { type: "text", value: "\n" }
              ]
            }
          ]
        }
      ]
    })
  })
})
