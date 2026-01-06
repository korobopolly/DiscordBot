Set objFSO = CreateObject("Scripting.FileSystemObject")
strFolder = objFSO.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = strFolder
WshShell.Run "cmd /c npm start", 0, False
