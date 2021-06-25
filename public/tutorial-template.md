# My Great Tutorial (D. Hilbert)
## Example lesson title

This file is written in a simple markdown format.  After changing it,
you upload the resulting file via the "LOAD YOUR OWN TUTORIAL" tab
from the home page.  Give your modfied file to your students for them to upload (or just give them the URL)
so they can work through your lessons.

The line that begins with # is
the title for the tutorial.  Lines that begin with ## give the names
of each lesson.  Macaulay2
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

## Other accepted formats

### HTML lessons
You can also upload lessons directly in HTML (file name with a .html extension). This offers the most flexibility since
no translation is performed except the following.

The <title> tag is the title of the tutorial.
If no <title> is given, the first element at top level is picked as the title (<h1> is a good choice).
Every <div> at top level is a page (lesson) in the tutorial. The first element of the <div> is the title of the page
(<h2> is a good choice). Every non <div> top level element will appear at the start of every lesson.


### M2 files
You can directly upload a Macaulay2 file (file name with a .m2 extension). This offers the least flexibility,
as code is simply displayed as a single page.
