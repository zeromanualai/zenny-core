import axios from 'axios';

export async function createZendeskTicket(
  subdomain: string,
  apiToken: string,
  email: string,
  subject: string,
  body: string,
  priority: string = 'normal',
  tags: string[] = ['zenny', 'ai_escalation']
): Promise<any> {
  const url = `https://${subdomain}.zendesk.com/api/v2/tickets.json`;

  const response = await axios.post(
    url,
    {
      ticket: {
        subject,
        comment: { body, public: false },
        priority,
        requester: { email },
        tags,
      },
    },
    {
      auth: {
        username: `${email}/token`,
        password: apiToken,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  return response.data.ticket;
}
