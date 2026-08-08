#include "SkylanderServer.h"
#include "EmulatedUSBDeviceFrame.h"
#include <wx/socket.h>
#include <wx/log.h>
#include <wx/cmdproc.h>
#include <wx/tokenzr.h>
#include <wx/file.h>
#include <wx/utils.h>
#include <iostream>
#include <sstream>

const int SERVER_PORT = 5678;

SkylanderServer::SkylanderServer(wxEvtHandler* parent)
	: wxThread(wxTHREAD_DETACHED), m_parent(parent)
{
	wxIPV4address addr;
	addr.AnyAddress();
	addr.Service(SERVER_PORT);

	m_server = new wxSocketServer(addr);

	if (!m_server->IsOk())
	{
		wxLogError("Failed to create server socket on port %d", SERVER_PORT);
		delete m_server;
		m_server = nullptr;
	}

	// Create SkylandersDumps directory and empty slots if missing
	if (!wxDirExists("SkylandersDumps"))
	{
		wxMkdir("SkylandersDumps");
	}

	for (int i = 0; i <= 8; i++)
	{
		wxString filePath = wxString::Format("SkylandersDumps/Slot%d.dump", i);
		if (!wxFileExists(filePath))
		{
			wxFile file(filePath, wxFile::write);
			if (file.IsOpened())
			{
				file.Close();
			}
		}
	}
}

SkylanderServer::~SkylanderServer()
{
	if (m_server)
	{
		m_server->Destroy();
	}
}

wxString UrlDecode(const wxString& s)
{
	wxString out;
	for (size_t i = 0; i < s.length(); ++i)
	{
		if (s[i] == '%' && i + 2 < s.length())
		{
			wxString hex = s.Mid(i + 1, 2);
			long val;
			if (hex.ToLong(&val, 16))
			{
				out.Append(static_cast<char>(val));
				i += 2;
			}
			else
			{
				out.Append('%');
			}
		}
		else if (s[i] == '+')
		{
			out.Append(' ');
		}
		else
		{
			out.Append(s[i]);
		}
	}
	return out;
}

wxString GetParam(const wxString& query, const wxString& key)
{
	wxStringTokenizer tokenizer(query, "&");
	while (tokenizer.HasMoreTokens())
	{
		wxString token = tokenizer.GetNextToken();
		if (token.StartsWith(key + "="))
		{
			return token.AfterFirst('=');
		}
	}
	return "";
}

wxString GetHeader(const wxString& headers, const wxString& key)
{
	wxString lower = headers.Lower();
	wxString keyLower = key.Lower() + ":";
	int pos = lower.Find(keyLower);
	if (pos == wxNOT_FOUND) return "";
	wxString value = headers.Mid(pos + keyLower.Length()).BeforeFirst('\r');
	value.Trim(true).Trim(false);
	return value;
}

void SendHttpResponse(wxSocketBase* sock, const wxString& body, const wxString& status = "200 OK")
{
	wxString response;
	response << "HTTP/1.1 " << status << "\r\n";
	response << "Content-Type: text/plain; charset=utf-8\r\n";
	response << "Content-Length: " << body.Length() << "\r\n";
	response << "Connection: close\r\n";
	response << "Access-Control-Allow-Origin: *\r\n";
	response << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
	response << "Access-Control-Allow-Headers: Content-Type, X-Device-Id\r\n";
	response << "\r\n";
	response << body;
	sock->Write(response.mb_str(), response.Length());
}

void SendFileResponse(wxSocketBase* sock, const wxString& filePath)
{
	wxFile file;
	if (file.Open(filePath, wxFile::read))
	{
		wxFileOffset length = file.Length();
		char* buffer = new char[length];
		file.Read(buffer, length);
		file.Close();

		wxString response;
		response << "HTTP/1.1 200 OK\r\n";
		response << "Content-Type: application/octet-stream\r\n";
		response << "Content-Length: " << length << "\r\n";
		response << "Connection: close\r\n";
		response << "Access-Control-Allow-Origin: *\r\n";
		response << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
		response << "Access-Control-Allow-Headers: Content-Type, X-Device-Id\r\n";
		response << "\r\n";
		sock->Write(response.mb_str(), response.Length());
		sock->Write(buffer, length);
		delete[] buffer;
	}
	else
	{
		SendHttpResponse(sock, "File not found", "404 Not Found");
	}
}

// Build a JSON status of all 8 slots
wxString BuildSlotsJson(const std::map<int, std::string>& slotOwners)
{
	std::ostringstream oss;
	oss << "{\"slots\":[";
	for (int i = 0; i < 8; i++)
	{
		if (i > 0) oss << ",";
		auto it = slotOwners.find(i);
		std::string owner = (it != slotOwners.end()) ? it->second : "";
		oss << "{\"slot\":" << i << ",\"owner\":\"" << owner << "\"}";
	}
	oss << "]}";
	return wxString(oss.str());
}

void* SkylanderServer::Entry()
{
	if (!m_server)
		return nullptr;

	long lastGlobalHeartbeat = wxGetLocalTime();

	while (!TestDestroy())
	{
		// Check per-device timeouts (10 secondi senza heartbeat = libera i suoi slot)
		long now = wxGetLocalTime();
		std::vector<std::string> timedOutDevices;
		for (auto& kv : m_deviceHeartbeats)
		{
			if (now - kv.second > 10)
			{
				timedOutDevices.push_back(kv.first);
			}
		}
		for (const auto& devId : timedOutDevices)
		{
			// Libera tutti gli slot di questo device
			for (auto& slotKv : m_slotOwners)
			{
				if (slotKv.second == devId)
				{
					slotKv.second = "";
					wxCommandEvent event(wxEVT_SKYL_COMMAND);
					event.SetInt(slotKv.first);
					event.SetString("CLEAR");
					wxPostEvent(m_parent, event);
					wxLogMessage("Device %s timed out. Cleared slot %d.", devId, slotKv.first);
				}
			}
			m_deviceHeartbeats.erase(devId);
		}

		// Wait up to 1 second for an incoming connection
		if (!m_server->WaitForAccept(1, 0))
		{
			continue;
		}

		wxSocketBase* sock = m_server->Accept(false);
		if (sock)
		{
			sock->SetTimeout(2);
			sock->SetFlags(wxSOCKET_BLOCK | wxSOCKET_WAITALL);

			char buffer[4096];
			wxString requestHeader;
			int contentLength = 0;
			
			// Read Headers
			while (sock->Read(buffer, 1).LastCount() == 1)
			{
				requestHeader.Append(buffer[0]);
				if (requestHeader.EndsWith("\r\n\r\n"))
					break;
			}

			wxString firstLine = requestHeader.BeforeFirst('\n');
			firstLine.Trim(true).Trim(false);
			
			// Extract Content-Length
			wxString lowerHeader = requestHeader.Lower();
			int clPos = lowerHeader.Find("content-length:");
			if (clPos != wxNOT_FOUND)
			{
				wxString clStr = lowerHeader.Mid(clPos + 15).BeforeFirst('\r');
				clStr.Trim(true).Trim(false);
				long cl;
				if (clStr.ToLong(&cl))
					contentLength = cl;
			}

			// Extract X-Device-Id header
			wxString deviceId = GetHeader(requestHeader, "X-Device-Id");
			std::string deviceIdStr = std::string(deviceId.mb_str());

			if (firstLine.StartsWith("OPTIONS"))
			{
				SendHttpResponse(sock, "");
			}
			else if (firstLine.StartsWith("GET /ping "))
			{
				SendHttpResponse(sock, "PONG");
			}
			else if (firstLine.StartsWith("GET /heartbeat"))
			{
				// Aggiorna heartbeat per device (se specificato nel query o header)
				wxString query = firstLine.Mid(4).AfterFirst('?').BeforeFirst(' ');
				wxString devFromQuery = UrlDecode(GetParam(query, "deviceId"));
				if (!devFromQuery.IsEmpty())
					deviceIdStr = std::string(devFromQuery.mb_str());

				if (!deviceIdStr.empty())
					m_deviceHeartbeats[deviceIdStr] = wxGetLocalTime();

				SendHttpResponse(sock, "OK");
			}
			else if (firstLine.StartsWith("GET /slots"))
			{
				// Restituisce JSON con lo stato di tutti gli 8 slot
				wxString json = BuildSlotsJson(m_slotOwners);
				wxString response;
				response << "HTTP/1.1 200 OK\r\n";
				response << "Content-Type: application/json; charset=utf-8\r\n";
				response << "Content-Length: " << json.Length() << "\r\n";
				response << "Connection: close\r\n";
				response << "Access-Control-Allow-Origin: *\r\n";
				response << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
				response << "Access-Control-Allow-Headers: Content-Type, X-Device-Id\r\n";
				response << "\r\n";
				response << json;
				sock->Write(response.mb_str(), response.Length());
			}
			else if (firstLine.StartsWith("GET /download?slot="))
			{
				wxString slotStr = firstLine.Mid(19).BeforeFirst(' ');
				wxString filePath = "SkylandersDumps/Slot" + slotStr + ".dump";
				SendFileResponse(sock, filePath);
			}
			else if (firstLine.StartsWith("GET /claim?"))
			{
				wxString query = firstLine.Mid(11).BeforeFirst(' ');
				wxString slotStr = GetParam(query, "slot");
				wxString devFromQuery = UrlDecode(GetParam(query, "deviceId"));
				if (!devFromQuery.IsEmpty())
					deviceIdStr = std::string(devFromQuery.mb_str());

				long slotNum;
				bool validSlot = slotStr.ToLong(&slotNum);

				if (!validSlot || slotNum < 0 || slotNum > 7 || deviceIdStr.empty())
				{
					SendHttpResponse(sock, "Invalid parameters", "400 Bad Request");
				}
				else
				{
					auto it = m_slotOwners.find((int)slotNum);
					std::string currentOwner = (it != m_slotOwners.end()) ? it->second : "";
					bool canClaim = currentOwner.empty() || currentOwner == deviceIdStr;

					if (!canClaim)
					{
						SendHttpResponse(sock, "Slot occupied by another device", "409 Conflict");
					}
					else
					{
						// Atomic claim: reserve slot for this device
						m_slotOwners[(int)slotNum] = deviceIdStr;
						m_deviceHeartbeats[deviceIdStr] = wxGetLocalTime();
						SendHttpResponse(sock, "CLAIMED");
					}
				}
			}
			else if (firstLine.StartsWith("POST /upload?"))

			{
				wxString query = firstLine.Mid(13).BeforeFirst(' ');
				wxString slotStr = GetParam(query, "slot");
				wxString devFromQuery = UrlDecode(GetParam(query, "deviceId"));
				if (!devFromQuery.IsEmpty())
					deviceIdStr = std::string(devFromQuery.mb_str());

				long slotNum;
				bool validSlot = slotStr.ToLong(&slotNum);

				if (!validSlot || slotNum < 0 || slotNum > 7)
				{
					SendHttpResponse(sock, "Invalid slot", "400 Bad Request");
				}
				else
				{
					// Controlla ownership
					auto it = m_slotOwners.find((int)slotNum);
					std::string currentOwner = (it != m_slotOwners.end()) ? it->second : "";

					bool canWrite = currentOwner.empty() || 
					                currentOwner == deviceIdStr ||
					                deviceIdStr.empty(); // backward compat

					if (!canWrite)
					{
						SendHttpResponse(sock, "Slot occupied by another device", "409 Conflict");
					}
					else if (contentLength > 0)
					{
						char* bodyBuffer = new char[contentLength];
						long totalRead = 0;
						while (totalRead < contentLength)
						{
							sock->Read(bodyBuffer + totalRead, contentLength - totalRead);
							long count = sock->LastCount();
							if (count <= 0) break;
							totalRead += count;
						}
						
						wxString filePath = wxString::Format("SkylandersDumps/Slot%ld.dump", slotNum);
						wxFile file;
						if (file.Open(filePath, wxFile::write))
						{
							file.Write(bodyBuffer, totalRead);
							file.Close();

							// Assegna ownership
							if (!deviceIdStr.empty())
							{
								m_slotOwners[(int)slotNum] = deviceIdStr;
								m_deviceHeartbeats[deviceIdStr] = wxGetLocalTime();
							}

							SendHttpResponse(sock, "OK");
						}
						else
						{
							SendHttpResponse(sock, "Failed to write file", "500 Internal Server Error");
						}
						delete[] bodyBuffer;
					}
					else
					{
						SendHttpResponse(sock, "Empty body", "400 Bad Request");
					}
				}
			}
			else if (firstLine.StartsWith("GET "))
			{
				wxString path = firstLine.Mid(4);
				path = path.BeforeFirst(' ');
				wxString query = path.AfterFirst('?');
				wxString cmd = GetParam(query, "cmd").Upper();
				wxString slotStr = GetParam(query, "slot");
				wxString filePath = UrlDecode(GetParam(query, "file"));
				wxString devFromQuery = UrlDecode(GetParam(query, "deviceId"));
				if (!devFromQuery.IsEmpty())
					deviceIdStr = std::string(devFromQuery.mb_str());

				long slotNum;
				bool validSlot = slotStr.ToLong(&slotNum);

				if (cmd == "SUMMON" && validSlot && !filePath.IsEmpty())
				{
					// Controlla ownership
					auto it = m_slotOwners.find((int)slotNum);
					std::string currentOwner = (it != m_slotOwners.end()) ? it->second : "";
					bool canSummon = currentOwner.empty() ||
					                 currentOwner == deviceIdStr ||
					                 deviceIdStr.empty();

					if (!canSummon)
					{
						SendHttpResponse(sock, "Slot occupied by another device", "409 Conflict");
					}
					else
					{
						// Assegna ownership
						if (!deviceIdStr.empty())
						{
							m_slotOwners[(int)slotNum] = deviceIdStr;
							m_deviceHeartbeats[deviceIdStr] = wxGetLocalTime();
						}

						wxCommandEvent event(wxEVT_SKYL_COMMAND);
						event.SetInt(slotNum);
						event.SetString(filePath);
						wxPostEvent(m_parent, event);
						SendHttpResponse(sock, "SUMMON OK");
					}
				}
				else if (cmd == "CLEAR" && validSlot)
				{
					// Controlla ownership - solo il proprietario può fare CLEAR
					auto it = m_slotOwners.find((int)slotNum);
					std::string currentOwner = (it != m_slotOwners.end()) ? it->second : "";
					bool canClear = currentOwner.empty() ||
					                currentOwner == deviceIdStr ||
					                deviceIdStr.empty();

					if (!canClear)
					{
						SendHttpResponse(sock, "Slot owned by another device", "409 Conflict");
					}
					else
					{
						// Libera ownership
						m_slotOwners[(int)slotNum] = "";
						wxCommandEvent event(wxEVT_SKYL_COMMAND);
						event.SetInt(slotNum);
						event.SetString("CLEAR");
						wxPostEvent(m_parent, event);
						SendHttpResponse(sock, "CLEAR OK");
					}
				}
				else
				{
					SendHttpResponse(sock, "Invalid parameters", "400 Bad Request");
				}
			}
			else
			{
				SendHttpResponse(sock, "Method Not Allowed", "405 Method Not Allowed");
			}

			sock->Destroy();
		}
	}
	return nullptr;
}

void SkylanderServer::Start()
{
	Create();
	Run();
}
