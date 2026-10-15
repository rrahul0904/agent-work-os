export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    service: 'visual-intelligence-platform',
    contractVersion: 'visual-intelligence-platform/v1alpha1',
    phase: 'A',
    releaseState: 'BUILDING'
  });
}
