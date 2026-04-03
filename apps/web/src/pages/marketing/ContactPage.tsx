import { useState } from "react";
import MarketingLayout from "./MarketingLayout";
import { Card, Button, StatusChip } from "@malv/ui";
import { Link, useNavigate } from "react-router-dom";

export default function ContactPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const mailtoHref =
    name.trim() && email.trim() && message.trim()
      ? `mailto:support@malv.local?subject=${encodeURIComponent(`Contact from ${name}`)}&body=${encodeURIComponent(
          `${message}\n\n— ${name} <${email}>`
        )}`
      : "";

  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        <div className="text-2xl font-extrabold tracking-tight">Contact</div>
        <div className="text-sm text-malv-text/70 mt-2 leading-relaxed">
          For product inquiries and partnerships. In-app messaging is not wired here yet — use mail or signed-in support tickets.
        </div>

        <Card variant="glass" className="p-4 mt-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <StatusChip label="Form not submitted to API" status="warning" />
            <span className="text-xs text-malv-text/55">Compose below, then send via your mail client or open tickets in the app.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="contact-name" className="text-sm font-semibold mb-2 block">
                Name
              </label>
              <input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl px-4 py-3 bg-transparent border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand/40 text-sm"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="text-sm font-semibold mb-2 block">
                Email
              </label>
              <input
                id="contact-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@domain.com"
                autoComplete="email"
                className="w-full rounded-xl px-4 py-3 bg-transparent border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand/40 text-sm"
              />
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="contact-message" className="text-sm font-semibold mb-2 block">
              Message
            </label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help?"
              className="w-full min-h-[140px] rounded-2xl px-4 py-3 bg-transparent border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand/40 text-sm resize-none"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="px-6"
              disabled={!mailtoHref}
              onClick={() => {
                if (mailtoHref) window.location.href = mailtoHref;
              }}
            >
              Open in email client
            </Button>
            <Button variant="secondary" className="px-6" type="button" onClick={() => navigate("/support")}>
              Support hub
            </Button>
          </div>
          <div className="mt-3 text-xs text-malv-text/55">
            Signed-in users: prefer <Link to="/app/tickets" className="text-brand underline-offset-2 hover:underline">support tickets</Link>{" "}
            for traceable threads.
          </div>
        </Card>
      </div>
    </MarketingLayout>
  );
}
