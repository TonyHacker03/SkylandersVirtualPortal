#include "SkylanderServer.h"

#include "EmulatedUSBDeviceFrame.h" // Per accedere alla finestra principale e inviare l'evento

#include <wx/socket.h>
#include <wx/log.h>
#include <wx/cmdproc.h>
#include <wx/tokenzr.h>
#include <iostream>

// Porta del server
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
}

SkylanderServer::~SkylanderServer()
{
	if (m_server)
	{
		m_server->Destroy();
	}
}

// Funzione di decoding URL (gestisce %20, +, ecc.)
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

// Decodifica semplice dei parametri GET (es. "cmd=SUMMON&slot=1&file=path")
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

// Funzione per inviare una risposta HTTP corretta
void SendHttpResponse(wxSocketBase* sock, const wxString& body, const wxString& status = "200 OK")
{
	wxString response;
	response << "HTTP/1.1 " << status << "\r\n";
	response << "Content-Type: text/plain; charset=utf-8\r\n";
	response << "Content-Length: " << body.Length() << "\r\n";
	response << "Connection: close\r\n";
	response << "\r\n";
	response << body;

	sock->Write(response.mb_str(), response.Length());
}

void* SkylanderServer::Entry()
{
	if (!m_server)
	{
		return nullptr;
	}

	while (!TestDestroy())
	{
		wxSocketBase* sock = m_server->Accept(true);
		if (sock)
		{
			char buffer[1024];
			wxString request;
			while (sock->Read(buffer, sizeof(buffer)).LastCount() > 0)
			{
				request.Append(wxString(buffer, wxConvUTF8, sock->LastCount()));
				if (request.Contains("\r\n\r\n")) // fine header HTTP
					break;
			}

			// Estrarre la riga della richiesta
			wxString firstLine = request.BeforeFirst('\n');
			firstLine.Trim(true).Trim(false);

			// Es: "GET /?cmd=SUMMON&slot=1&file=xxx HTTP/1.1"
			if (firstLine.StartsWith("GET "))
			{
				wxString path = firstLine.Mid(4);
				path = path.BeforeFirst(' ');

				wxString query = path.AfterFirst('?');

				wxString cmd = GetParam(query, "cmd").Upper();
				wxString slotStr = GetParam(query, "slot");
				wxString filePath = UrlDecode(GetParam(query, "file"));

				long slotNum;
				bool validSlot = slotStr.ToLong(&slotNum);

				if (cmd == "SUMMON" && validSlot && !filePath.IsEmpty())
				{
					wxCommandEvent event(wxEVT_SKYL_COMMAND);
					event.SetInt(slotNum);
					event.SetString(filePath);
					wxPostEvent(m_parent, event);

					SendHttpResponse(sock, "SUMMON OK");
				}
				else if (cmd == "CLEAR" && validSlot)
				{
					wxCommandEvent event(wxEVT_SKYL_COMMAND);
					event.SetInt(slotNum);
					event.SetString("CLEAR");
					wxPostEvent(m_parent, event);

					SendHttpResponse(sock, "CLEAR OK");
				}
				else
				{
					SendHttpResponse(sock, "Invalid parameters", "400 Bad Request");
				}
			}
			else
			{
				SendHttpResponse(sock, "Only GET supported", "405 Method Not Allowed");
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
