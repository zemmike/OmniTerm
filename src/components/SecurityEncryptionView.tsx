import React, { useState } from 'react';
import {
  Lock,
  Shield,
  Key,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Terminal,
} from 'lucide-react';

export const SecurityEncryptionView: React.FC = () => {
  const [plainText, setPlainText] = useState('{"user":"dev_alex","session_token":"secret_jwt_payload_9981","timestamp":1754980000}');
  const [encryptedOutput, setEncryptedOutput] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [sshKey, setSshKey] = useState({
    type: 'Ed25519',
    fingerprint: 'SHA256:e4/8A+Q9zK31mZ8pP4vL8xN1qR7tY2wB6sM0uV5iO2x',
    publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH9a+G4z1M3PqX8rL7vN0kY2wB6sM0uV5iO2x9aQ devterminal-prod-key',
  });

  const handleEncryptPayload = () => {
    if (!plainText) return;
    const fakeIv = Array.from({ length: 12 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    const fakeCiphertext = btoa(plainText).split('').reverse().join('');
    const fakeHmac = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

    setEncryptedOutput(`[AES-256-GCM Payload Encryption Preview]\nIV (Initialization Vector): 0x${fakeIv}\nCiphertext (Base64 Reversed): ${fakeCiphertext}\nHMAC Auth Tag: 0x${fakeHmac}\nTLS Handshake Status: TLS 1.3 (ECDHE_ECDSA_WITH_AES_256_GCM_SHA384)`);
  };

  const handleGenerateNewSshKey = () => {
    const randomHex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setSshKey({
      type: 'RSA-4096',
      fingerprint: `SHA256:${randomHex.substring(0, 24)}`,
      publicKey: `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQD${randomHex}== devterminal-generated-key`,
    });
  };

  const copyPublicKey = () => {
    navigator.clipboard.writeText(sshKey.publicKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 bg-[#0F0F10] text-[#E0E0E5] font-mono min-h-[calc(100vh-125px)] space-y-6">
      {/* Title */}
      <div className="border-b border-[#2A2A2E] pb-4">
        <h1 className="text-lg font-bold text-[#E0E0E5] flex items-center gap-2">
          <Lock className="w-5 h-5 text-[#00FF41]" />
          <span>SECURITY, ENCRYPTION PROTOCOLS & SSH KEY MANAGEMENT</span>
        </h1>
        <p className="text-xs text-[#88888E]">
          Inspect TLS 1.3 transmission encryption, generate SSH keypairs, and test payload cipher encryption.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interactive Encryption Simulator */}
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
            <span className="font-bold text-xs text-[#E0E0E5] flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#00FF41]" />
              <span>AES-256-GCM TRANSMISSION PAYLOAD ENCRYPTION</span>
            </span>
            <span className="text-[10px] font-mono text-[#00FF41]">TLS 1.3 Active</span>
          </div>

          <div className="space-y-2 text-xs">
            <label className="block text-[#88888E] font-bold uppercase">Plaintext Payload Input:</label>
            <textarea
              value={plainText}
              onChange={(e) => setPlainText(e.target.value)}
              rows={4}
              className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded p-2.5 text-[#00FF41] font-mono text-xs focus:outline-none focus:border-[#00FF41]"
            />
          </div>

          <button
            onClick={handleEncryptPayload}
            className="w-full py-2 bg-[#00FF41] hover:bg-[#00D035] font-bold text-black uppercase text-xs rounded transition-colors"
          >
            Encrypt Payload with AES-256-GCM
          </button>

          {encryptedOutput && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#88888E] uppercase">Ciphertext Result:</div>
              <pre className="p-3 rounded bg-[#0A0A0B] border border-[#2A2A2E] text-xs font-mono text-[#00FF41] whitespace-pre-wrap leading-relaxed">
                {encryptedOutput}
              </pre>
            </div>
          )}
        </div>

        {/* SSH Keypair Generator */}
        <div className="bg-[#161618] border border-[#2A2A2E] rounded p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
            <span className="font-bold text-xs text-[#E0E0E5] flex items-center gap-2">
              <Key className="w-4 h-4 text-[#FFBD2E]" />
              <span>SSH KEYPAIR & FINGERPRINT GENERATOR</span>
            </span>
            <button
              onClick={handleGenerateNewSshKey}
              className="px-2.5 py-1 rounded bg-[#202024] hover:bg-[#2A2A2E] border border-[#2A2A2E] text-xs text-[#E0E0E5] flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#FFBD2E]" />
              <span>Generate Key</span>
            </button>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div>
              <span className="text-[#55555E] block uppercase font-bold">Key Type:</span>
              <span className="font-bold text-[#E0E0E5]">{sshKey.type}</span>
            </div>

            <div>
              <span className="text-[#55555E] block uppercase font-bold">SHA-256 Fingerprint:</span>
              <span className="text-[#FFBD2E] font-bold break-all">{sshKey.fingerprint}</span>
            </div>

            <div>
              <div className="flex items-center justify-between text-[#88888E] mb-1 font-bold uppercase">
                <span>Public Key:</span>
                <button
                  onClick={copyPublicKey}
                  className="text-[#00FF41] hover:underline text-[11px] flex items-center gap-1"
                >
                  {copiedKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>
              <textarea
                value={sshKey.publicKey}
                readOnly
                rows={3}
                className="w-full bg-[#0A0A0B] border border-[#2A2A2E] rounded p-2 text-[#E0E0E5] font-mono text-[11px] focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
