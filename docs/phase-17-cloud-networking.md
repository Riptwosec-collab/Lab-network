# Phase 17 — Vendor-neutral Cloud Networking

Phase 17 models cloud networking without AWS, Azure or GCP-specific contracts. A cloud device owns typed resources with a shared identity model and a deterministic flow engine.

## Resource model

Every resource contains `id`, `name`, `type`, generic `region`, optional `networkId` and `subnetId`, `tags`, lifecycle `status`, and typed `configuration`. Supported resources are cloud networks, public/private subnets, route tables, Internet/NAT/VPN gateways, Security Groups, Network ACLs, load balancers, virtual machines, cloud storage/databases, private endpoints, VPC peering and transit networks.

The built-in cloud starts with `10.20.0.0/16`, a public `10.20.1.0/24` subnet and a private `10.20.2.0/24` subnet. Public workloads use an Internet Gateway and public IP. Private workloads use a NAT Gateway located in the public subnet.

## Flow decision pipeline

1. Validate source resource, private IP, subnet and lifecycle state.
2. Evaluate stateful Security Group outbound policy.
3. Evaluate ordered, stateless Network ACL outbound policy.
4. Longest-prefix match the subnet's real route table.
5. Validate IGW, NAT, VPN, peering or transit target semantics.
6. For resource destinations, evaluate inbound Network ACL then inbound Security Group policy.
7. Report route, policy decisions, stateful return behavior and translated source IP.

Private subnets are explicitly denied when configured for direct Internet Gateway access. Peering CIDRs are rejected if they overlap the local cloud network.

## User surfaces

- Device Inspector → **Cloud Network**: nested network/subnet view, attached workloads, route target editing, clickable SG/NACL decisions, and peering framework creation.
- Bottom panel → **Cloud**: simulate ICMP/TCP/UDP traffic from a VM to the Internet or another cloud resource and inspect each decision step.
- CLI: `show cloud resources`, `show cloud routes`, `show cloud security`, `test cloud flow ...`, and `cloud route-table ... default via ...`.
- Lab Center: **Vendor-neutral Cloud Networking** validates public IGW access, private NAT access and stateful/stateless policy attachment from live configuration.

## Verification

Unit coverage includes public Internet access, private NAT, missing routes, invalid direct private Internet access, Security Group block, Network ACL block, VPC peering, overlapping CIDRs and site-to-site VPN routing.
