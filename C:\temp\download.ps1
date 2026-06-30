[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri "https://tmpfiles.org/dl/wfwHtKPepJub/desktop-touch-mcp-dist.zip" -OutFile "C:\temp\dist.zip"
echo "DOWNLOAD_DONE"
