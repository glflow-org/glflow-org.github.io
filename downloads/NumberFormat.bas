Attribute VB_Name = "NumberFormat"
Option Explicit
Public Sub ToggleNumberFormat()
Attribute ToggleNumberFormat.VB_ProcData.VB_Invoke_Func = "M\n14"

' Shortcut key: Ctrl+Shift+M

    Dim targetRange As Range

    On Error GoTo CleanFail

    If Not TypeOf Selection Is Excel.Range Then Exit Sub
    Set targetRange = Selection

    If targetRange.Cells(1, 1).NumberFormat = "#,##0.00" Then
        targetRange.NumberFormat = "General"
    Else
        targetRange.NumberFormat = "#,##0.00"
    End If

    Exit Sub

CleanFail:
    MsgBox "Unable to change the format.", vbExclamation, "Error"


End Sub



