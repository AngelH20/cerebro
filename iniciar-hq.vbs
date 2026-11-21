' Arranca el servidor HQ en segundo plano (sin ventana). Pon un acceso directo a este archivo en shell:startup.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "node server.mjs", 0, False
