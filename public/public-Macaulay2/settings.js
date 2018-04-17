var mathProgramName = "Macaulay2";

var DefaultText = "";

const loadEditorDefault = function () {
    DefaultText = document.getElementById("editorDefault").contentWindow.document.body.childNodes[0].textContent;
    document.getElementById("M2In").innerHTML=Prism.highlight(DefaultText,Prism.languages.macaulay2);
}



