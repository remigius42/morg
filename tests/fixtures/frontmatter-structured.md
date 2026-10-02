---
# a yaml comment survives
title: "Quoted: title"
meta:
  author:
    name: Someone
    url: https://example.com
  draft: true
tags: [one, two]
desc: |
  line one
  * a line org would read as a headline
  #+end_comment
  ,* already escaped
folded: >
  folded
  text
---

# Heading

Body text.
