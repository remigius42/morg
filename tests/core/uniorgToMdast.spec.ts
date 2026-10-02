import { describe, it, expect } from "vitest"
import { transformUniorgAstToMdast } from "../../src/core/uniorgToMdast/index.js"
import type { OrgData } from "uniorg"
import type { Root as MdastRoot } from "mdast"
import { transformMdastToUniorgAst } from "../../src/core/mdastToUniorg/index.js"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"

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

  it("should carry the frontmatter through both exported transforms", () => {
    const mdast: MdastRoot = {
      type: "root",
      children: [
        {
          type: "yaml",
          value:
            "title: x # kept\n* star\nmorg_properties:\n  - ID: abc\nmorg_keywords:\n  - STARTUP: overview"
        },
        { type: "paragraph", children: [{ type: "text", value: "Body." }] }
      ]
    }
    const uniorgAst = transformMdastToUniorgAst(mdast)
    const before = JSON.stringify(uniorgAst)

    const back = transformUniorgAstToMdast(uniorgAst)

    expect(back.children[0]).toEqual({
      type: "yaml",
      value:
        "title: x # kept\n* star\nmorg_properties:\n  - ID: abc\nmorg_keywords:\n  - STARTUP: overview"
    })
    expect(back.children).toHaveLength(2)
    // the caller's tree stays as it was
    expect(JSON.stringify(uniorgAst)).toBe(before)
  })

  it("should read the frontmatter block of a tree parsed from org text", () => {
    // uniorg drops the block's marker; the text it was parsed from has it
    const org =
      "#+title: T\n#+begin_comment morg_frontmatter\na: 1\n#+end_comment\nBody.\n"
    const uniorgAst = unified().use(uniorgParse).parse(org)
    const before = JSON.stringify(uniorgAst)

    const back = transformUniorgAstToMdast(uniorgAst, { org })

    expect(back.children[0]).toEqual({
      type: "yaml",
      value: "a: 1\nmorg_keywords:\n  - TITLE: T"
    })
    expect(back.children).toHaveLength(2)
    expect(JSON.stringify(uniorgAst)).toBe(before)
  })

  it("should read keywords kept apart from the block back", () => {
    const yaml = "a: 1\nmorg_keywords:\n  - NAME: x\n  - TITLE: t"
    const back = transformUniorgAstToMdast(
      transformMdastToUniorgAst({
        type: "root",
        children: [{ type: "yaml", value: yaml }]
      })
    )

    expect(back.children).toEqual([{ type: "yaml", value: yaml }])
  })
})
