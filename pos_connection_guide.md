# Koutix POS Connection Guide

This document provides the technical requirements and configuration details for connecting your Point-of-Sale (POS) system to the Koutix platform.

## 📋 Integration Compatibility Matrix

| POS System | Method | Auth Type | Use Case |
| :--- | :--- | :--- | :--- |
| **LS Retail** | `API Pull` | Bearer/Basic | Automated stock & sales polling |
| **SAP** | `Webhook` | Secret Key | Real-time push events |
| **Custom** | `Flexible` | Per Config | Bespoke integrations |

---

## 🔑 Connection Requirements

### 1. LS Retail (API Pull)
Koutix acts as the client and pulls data from your server at regular intervals.

*   **Endpoint (Base URL)**: `https://[your-api-domain]/v1` (Must be HTTPS).
*   **Authentication Options**:
    *   **Bearer Token**: Provide a static `apiKey`.
    *   **Basic Auth**: Provide `username` and `password`.
*   **Pull Interval**: Default is **300 seconds** (5 minutes). Minimum allowed is 60 seconds.

### 2. SAP (Webhook)
Your SAP instance pushes data to Koutix immediately when a transaction occurs.

*   **Inbound Webhook URL**:  
    `http://localhost:5001/api/pos/webhook/[Your_Store_ID]/sap`
*   **Security Header**:  
    You must include the `X-Webhook-Secret` in your outbound request headers.
*   **Payload Format**:  
    Koutix expects the standard SAP Sales Order JSON schema.

### 3. Custom Integration
For other systems, follow the generic REST configuration:

*   **Headers**: `Content-Type: application/json`
*   **Method**: `POST`
*   **Payload**: Standard Koutix Transaction Schema.

---

## 🛠️ Testing & Troubleshooting

### Connectivity Test
Before finalizing, use the **Test Connection** feature in the dashboard:
1.  **LS Retail**: Koutix will attempt to fetch a single sample record from your `/sales` endpoint.
2.  **SAP**: Koutix will send a ping to your configured `sapServerUrl` to check if your firewall allows communication.

### Common Issues
*   **Timeouts**: Ensure your API responds within 15 seconds.
*   **SSL Errors**: If using self-signed certificates, ensure your server is configured to allow our worker IP addresses.
*   **Invalid Credentials**: For LS Retail, verify that the user has `READ` permissions for the sales history tables.

---
*Last Updated: 2026-04-10*
