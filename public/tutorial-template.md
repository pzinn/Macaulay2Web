# My Great Tutorial (D. Hilbert)
## Lesson 1 title

This file is written in a simple markdown format.  After changing it,
you upload the resulting file via the "LOAD YOUR OWN TUTORIAL" tab
from the home page.  Give your modfied file to your students, and
after they upload it themselves, they can work through your lessons.

The line that begins with # is
the title for the tutorial.  Lines that begin with ## give the names
of each lesson.  Latex math, via mathjax, can be used, and Macaulay2
code that you wish to become buttons should be enclosed by backquotes (	`	) or
triple backquotes (	```	), as is shown below.

Blank lines start new paragraphs.

## Code
Macaulay2 commands (which will be displayed as clickable buttons) are
enclosed in triple backquotes (as is standard in many markdown
languages). Here we have blank lines between them, but that is not
required.

```
R = QQ[x]
```

```
x^3-x-1
```

or inline: `factor(x^2-1)`.

Multiple lines can be placed in one button too.

```
f = x -> (
    x^3-x-1
    )
```

## KaTeX
We use katex, which means that you can include math, in the following way:
using **\(** **\)** for inline: \(f(x) = x^3-\sin x + 1\), or in display form via
**\[** **\]**:
\[ \sum_{i=0}^n (x_i y_i + 1). \]


## More markdown
Other recognized markdown includes:
* lists
* *various* _standard_ **style** __modifications__
* [links](https://github.com/pzinn/Macaulay2Web)
* tables
| 1 | 2 | 3 |
| 4 | 5 | 6 |

Caveat: markdown conversion can interfere with (Ka)TeX code.

## HTML lessons
You can also upload html lessons, using <title> (or <h1>) for the title. Each page should be one <div>.
For consistency of style, it is advised to
start each page with a title with tag <h2>.
