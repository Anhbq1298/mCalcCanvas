# EC3 integration plan and audit

Base: bc5a0b5, fetched main on 2026-11-10. The existing steel template is an unvalidated draft with placeholder kij and no classification, shear interaction, section catalogue or SLS. No section utilities exist. The engine accepts numeric quantities/vectors, not strings; batch overrides are numeric. Preserve this contract: stable numeric section/property IDs with human-readable catalogue labels, rather than adding a second evaluator or widening every worker and batch protocol to strings.

Integration: deterministic engineering module -> fixed engine functions -> ordinary math regions -> existing worker and batch pool. Section selection updates a normal section-ID definition; individual sectionProp definitions remain editable. Custom section values are literal worksheet definitions so documents remain portable. The reusable browser catalogue stores custom profiles locally as an optional convenience, never as a hidden calculation dependency. No document schema or extension change.

1. Versioned offline catalogue with original source units, attribution and validation.
2. EC3 2005+A1:2014 module: classification, resistance, stability, LTB and interaction; explicit unknown states.
3. Fixed parser/evaluator functions and batch bindings.
4. Compact worksheet, contextual section/LTB pickers and printable reference diagrams.
5. Independent numerical fixtures; real Chromium workflow, serialization, PDF layout review; complete repository checks.

Scope boundaries: doubly symmetric prismatic rolled I/H members. Class 4 effective sections, nonuniform/monosymmetric members, arbitrary LTB loading/eigenanalysis, automatic Annex A, and unvalidated Annex B branches must be NOT VERIFIED. Elastic section interaction is the explicitly permitted conservative §6.2.1(7) method, not an invented plastic interaction. National Annex values are editable, without claiming a country's approval. Catalogue properties are not Dlubal-owned data: no redistribution licence was established for Dlubal's full catalogue. Licensed alternative datasets retain notices and provenance. UB/UC catalogue import is withheld pending a redistributable verified dataset; user-defined UB/UC remain possible.
