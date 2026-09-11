import { describe, it, expect } from "vitest"
import { transformUniorgAstToMdast } from "../src/core/uniorgToMdast/index.js"
import type { OrgData } from "uniorg"

describe("transformUniorgAstToMdast", () => {
  it("should transform an empty uniorg AST to an empty mdast", () => {
    const uniorgAst: OrgData = {
      type: "org-data",
      children: [],
      contentsBegin: 0,
      contentsEnd: 0
    }

    const mdast = transformUniorgAstToMdast(uniorgAst)

    expect(mdast).toMatchObject({
      type: "root",
      children: []
    })
  })

  it("should convert bold, italic and links", () => {
    const uniorgAst = {
      type: "org-data",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "This is " },
            { type: "italic", children: [{ type: "text", value: "italic" }] },
            { type: "text", value: " and " },
            { type: "bold", children: [{ type: "text", value: "bold" }] },
            { type: "text", value: ", see " },
            {
              type: "link",
              format: "bracket",
              linkType: "https",
              rawLink: "https://example.com",
              path: "//example.com",
              children: [{ type: "text", value: "Example" }]
            },
            { type: "text", value: "." }
          ]
        }
      ],
      contentsBegin: 0,
      contentsEnd: 0
    } as unknown as OrgData

    const mdast = transformUniorgAstToMdast(uniorgAst)

    expect(mdast).toMatchObject({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "This is " },
            { type: "emphasis", children: [{ type: "text", value: "italic" }] },
            { type: "text", value: " and " },
            { type: "strong", children: [{ type: "text", value: "bold" }] },
            { type: "text", value: ", see " },
            {
              type: "link",
              url: "https://example.com",
              children: [{ type: "text", value: "Example" }]
            },
            { type: "text", value: "." }
          ]
        }
      ]
    })
  })

  it("should give a description-less link its url as text", () => {
    const uniorgAst = {
      type: "org-data",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "link",
              format: "plain",
              linkType: "https",
              rawLink: "https://example.org",
              path: "//example.org",
              children: []
            }
          ]
        }
      ],
      contentsBegin: 0,
      contentsEnd: 0
    } as unknown as OrgData

    const mdast = transformUniorgAstToMdast(uniorgAst)

    expect(mdast).toMatchObject({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "link",
              url: "https://example.org",
              children: [{ type: "text", value: "https://example.org" }]
            }
          ]
        }
      ]
    })
  })

  it("should isolate inline footnote state between runs", () => {
    const buildAst = (): OrgData =>
      ({
        type: "org-data",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", value: "Note" },
              {
                type: "footnote-reference",
                footnoteType: "inline",
                label: "",
                children: [{ type: "text", value: "inline note" }]
              }
            ]
          }
        ],
        contentsBegin: 0,
        contentsEnd: 0
      }) as unknown as OrgData

    const first = transformUniorgAstToMdast(buildAst())
    const second = transformUniorgAstToMdast(buildAst())

    expect(second).toEqual(first)
  })
})
