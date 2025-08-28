#pragma once

#include <wx/thread.h>
#include <wx/socket.h>
#include <wx/event.h>

// Classe che implementa il server in un thread separato
class SkylanderServer : public wxThread
{
  public:
	// Costruttore
	SkylanderServer(wxEvtHandler* parent);
	// Distruttore
	~SkylanderServer();

	// Metodo per avviare il server
	void Start();

  protected:
	// La funzione principale del thread, dove si trova il ciclo del server
	virtual void* Entry() wxOVERRIDE;

  private:
	// Un puntatore all'handler di eventi genitore (la finestra della GUI)
	wxEvtHandler* m_parent;
	// Il socket del server
	wxSocketServer* m_server;
};