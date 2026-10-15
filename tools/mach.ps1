# Runs ./mach inside the MozillaBuild environment.
# Usage: powershell -ExecutionPolicy Bypass -File tools\mach.ps1 build faster
$env:MOZILLABUILD = 'C:\mozilla-build\'
$env:HOME = $env:USERPROFILE
$machArgs = ($args | ForEach-Object { "'" + ($_ -replace "'", "'\''") + "'" }) -join ' '
& C:\mozilla-build\msys2\usr\bin\bash.exe --login -c "export PATH=/c/Users/patrick/.cargo/bin:`$PATH; cd /c/patrium/src && ./mach $machArgs"
exit $LASTEXITCODE
