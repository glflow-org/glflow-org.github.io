Attribute VB_Name = "SwitchSign"
Option Explicit

Sub SwitchSignForVisibleNumericConstants()
Attribute SwitchSignForVisibleNumericConstants.VB_ProcData.VB_Invoke_Func = "I\n14"

' Shortcut key: Ctrl+Shift+I

    Dim selectedRange As Range
    Dim visibleCells As Range
    Dim numericConstants As Range
    Dim currentArea As Range
    Dim valuesArray As Variant
    Dim rowIndex As Long
    Dim columnIndex As Long

    Dim previousCalculationMode As XlCalculation
    Dim previousScreenUpdating As Boolean
    Dim previousEnableEvents As Boolean

    On Error GoTo HandleError

    If Not TypeOf Selection Is Excel.Range Then Exit Sub
    Set selectedRange = Selection

    previousCalculationMode = Application.Calculation
    previousScreenUpdating = Application.ScreenUpdating
    previousEnableEvents = Application.EnableEvents

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    If selectedRange.Cells.CountLarge = 1 Then
        If Not selectedRange.EntireRow.Hidden And Not selectedRange.EntireColumn.Hidden Then
            If Not selectedRange.HasFormula Then
                If IsNumeric(selectedRange.Value2) And Len(selectedRange.Value2) > 0 Then
                    selectedRange.Value2 = CDbl(selectedRange.Value2) * -1
                End If
            End If
        End If
        GoTo CleanExit
    End If

    On Error Resume Next
    Set visibleCells = selectedRange.SpecialCells(xlCellTypeVisible)
    If Not visibleCells Is Nothing Then
        Set numericConstants = visibleCells.SpecialCells(xlCellTypeConstants, xlNumbers)
    End If
    On Error GoTo HandleError

    If numericConstants Is Nothing Then GoTo CleanExit

    For Each currentArea In numericConstants.Areas
        If currentArea.Cells.CountLarge = 1 Then
            currentArea.Value2 = CDbl(currentArea.Value2) * -1
        Else
            valuesArray = currentArea.Value2

            For rowIndex = LBound(valuesArray, 1) To UBound(valuesArray, 1)
                For columnIndex = LBound(valuesArray, 2) To UBound(valuesArray, 2)
                    valuesArray(rowIndex, columnIndex) = CDbl(valuesArray(rowIndex, columnIndex)) * -1
                Next columnIndex
            Next rowIndex

            currentArea.Value2 = valuesArray
        End If
    Next currentArea

CleanExit:
    Application.Calculation = previousCalculationMode
    Application.EnableEvents = previousEnableEvents
    Application.ScreenUpdating = previousScreenUpdating
    Exit Sub

HandleError:
    Application.Calculation = previousCalculationMode
    Application.EnableEvents = previousEnableEvents
    Application.ScreenUpdating = previousScreenUpdating
    MsgBox "An error occurred while switching signs: " & Err.Description, vbExclamation, "Switch Sign"
End Sub



