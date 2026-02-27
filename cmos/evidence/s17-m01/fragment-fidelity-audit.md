# Fragment Fidelity Audit

- Generated: 2026-02-27T06:10:32.544Z
- Foundry endpoint: http://127.0.0.1:4466/run
- Registry version: 2026-02-24
- Structured data generatedAt: 2026-02-24T05:09:44Z
- Components audited: 84
- Classification totals:
  - full-content: 3
  - partial: 75
  - empty-shell: 5
  - error: 1

## Fidelity Table

| Component | Classification | Root | data-prop-* attrs | Structure / Notes |
| --- | --- | --- | --- | --- |
| AddressCollectionPanel | partial | section | data-prop-default-role-field, data-prop-field, data-prop-role-field, data-prop-role-parameter | section -> children: header, h3, div; text: "Addresses" |
| AddressEditor | partial | form | data-prop-allow-dynamic-parameter, data-prop-default-role-field, data-prop-field, data-prop-role-parameter | form -> children: header, h3, div, label, span, input; text: "Address Editor Street City Region Postal Code" |
| AddressSummaryBadge | partial | span | data-prop-field | span -> children: none; text: "Address" |
| AddressValidationTimeline | partial | div | data-prop-field | div -> children: h3, ol, li; text: "Address Validation Timeline No events" |
| ArchiveEvent | partial | article | data-prop-archived-at-field, data-prop-reason-field, data-prop-restored-at-field | article -> children: p; text: "Archive Event" |
| ArchivePill | partial | span | data-prop-archived-at-field, data-prop-field | span -> children: none; text: "Archive" |
| ArchiveSummary | partial | section | data-prop-archived-at-field, data-prop-archived-field, data-prop-reason-field, data-prop-restore-window-parameter, data-prop-restored-at-field, data-prop-retain-history-parameter | section -> children: h3, dl, div, dt, dd; text: "Archive Summary Archived At ArchiveSummary archivedAtField R" |
| AuditEvent | partial | article | data-prop-timestamp-field, data-prop-timezone-parameter, data-prop-type-field | article -> children: p; text: "Audit Event" |
| AuditTimeline | partial | div | data-prop-created-field, data-prop-event-field, data-prop-event-options-parameter, data-prop-event-timestamp-field, data-prop-updated-field | div -> children: h3, ol, li; text: "Audit Timeline No events" |
| Badge | partial | span | data-prop-intent | span -> children: none; text: "Active" |
| Banner | partial | section | data-prop-intent | section -> children: none; text: "Track pipeline health and delivery metrics." |
| Button | full-content | button | none | button -> children: none; text: "Primary action" |
| CancellationBadge | partial | span | data-prop-field | span -> children: none; text: "Cancellation" |
| CancellationEvent | partial | article | data-prop-code-field, data-prop-label-field, data-prop-timestamp-field | article -> children: p; text: "Cancellation Event" |
| CancellationForm | partial | form | data-prop-allowed-reasons-parameter, data-prop-code-field, data-prop-reason-field, data-prop-require-reason-parameter, data-prop-window-parameter | form -> children: header, h3, div, label, span, select; text: "Cancellation Form Reason Code no_longer_needed budget duplic" |
| CancellationSummary | partial | section | data-prop-cancel-at-period-end-field, data-prop-code-field, data-prop-reason-field, data-prop-requested-at-field | section -> children: h3, dl, div, dt, dd; text: "Cancellation Summary Cancel at Period End CancellationSummar" |
| Card | empty-shell | article | data-prop-trend, data-prop-value | article (no inner HTML) |
| CardHeader | partial | header | data-prop-supporting-field, data-prop-title-field | header -> children: h3; text: "Card" |
| ClassificationBadge | partial | span | data-prop-primary-category-field, data-prop-tag-preview-field | span -> children: none; text: "Classification" |
| ClassificationEditor | partial | form | data-prop-max-tags-parameter, data-prop-mode-parameter, data-prop-tag-policy-parameter | form -> children: header, h3, div, label, span, input; text: "Classification Editor Category Tags Mode strict flexible" |
| ClassificationPanel | partial | section | data-prop-categories-field, data-prop-metadata-field, data-prop-mode-parameter, data-prop-tags-field | section -> children: header, h3, div; text: "Classification" |
| ColorizedBadge | partial | span | data-prop-field | span -> children: none; text: "Color" |
| ColorStatePicker | partial | fieldset | data-prop-field, data-prop-parameter | fieldset -> children: legend, div, label, span, select, option; text: "Color State Picker Color State default success warning criti" |
| ColorSwatch | partial | span | data-prop-field, data-prop-size | span -> children: none; text: "default" |
| CommunicationDetailPanel | partial | section | data-prop-channels-field, data-prop-conversations-field, data-prop-policies-field, data-prop-templates-field | section -> children: header, h3, div; text: "Communication" |
| DetailHeader | partial | header | data-prop-subtitle-field, data-prop-title-field | header -> children: h2; text: "Details" |
| FormLabelGroup | partial | label | data-prop-label-field, data-prop-placeholder-field | label -> children: span; text: "Label" |
| GeocodablePreview | partial | section | data-prop-detected-fields-field, data-prop-requires-lookup-field, data-prop-resolution-field | section -> children: h3, dl, div, dt, dd; text: "Geocodable Preview Resolution GeocodablePreview resolutionFi" |
| GeoFieldMappingForm | partial | form | data-prop-auto-detect-field, data-prop-identifier-field, data-prop-latitude-field, data-prop-longitude-field | form -> children: header, h3, div, label, span, input; text: "Geo Field Mapping Latitude Field Longitude Field Identifier " |
| GeoResolutionBadge | partial | span | data-prop-resolution-field | span -> children: none; text: "Geo" |
| Grid | error | n/a | none | UNKNOWN_COMPONENT: Component 'Grid' is not in the OODS registry |
| InlineLabel | empty-shell | span | data-prop-field | span (no inner HTML) |
| Input | partial | input | data-prop-label | input -> children: input; text: none |
| LabelCell | partial | span | data-prop-description-field, data-prop-field | span -> children: span; text: none |
| MembershipAuditTimeline | partial | div | data-prop-field | div -> children: h3, ol, li; text: "Membership Timeline No events" |
| MembershipPanel | partial | section | data-prop-hierarchy-field, data-prop-memberships-field, data-prop-permission-field, data-prop-role-field | section -> children: header, h3, div; text: "Membership" |
| MessageEventTimeline | partial | div | data-prop-messages-field, data-prop-statuses-field | div -> children: h3, ol, li; text: "Message Timeline No events" |
| MessageStatusBadge | partial | span | data-prop-statuses-field | span -> children: none; text: "Message" |
| OwnerBadge | partial | span | data-prop-owner-id-field, data-prop-owner-type-field | span -> children: none; text: "Owner" |
| OwnershipMeta | partial | div | data-prop-owner-type-field, data-prop-role-field | div -> children: span, strong; text: "Ownership Owner Type: OwnershipMeta ownerTypeField Role: Own" |
| OwnershipSummary | partial | section | data-prop-allow-transfer-parameter, data-prop-owner-id-field, data-prop-owner-type-field, data-prop-role-field, data-prop-transferred-at-field | section -> children: h3, dl, div, dt, dd; text: "Ownership Summary Owner ID OwnershipSummary ownerIdField Own" |
| PreferenceEditor | partial | form | data-prop-document-field, data-prop-namespaces-field, data-prop-registry-namespace-parameter | form -> children: header, h3, div, label, span, select; text: "Preference Editor Namespace default Preference Document" |
| PreferencePanel | partial | section | data-prop-metadata-field, data-prop-namespace-field, data-prop-preferences-field | section -> children: header, h3, div; text: "Preferences" |
| PreferenceSummaryBadge | partial | span | data-prop-namespaces-field, data-prop-version-field | span -> children: none; text: "Preferences" |
| PreferenceTimeline | partial | div | data-prop-metadata-field | div -> children: h3, ol, li; text: "Preference Timeline No events" |
| PriceBadge | partial | span | data-prop-amount-field, data-prop-currency-field | span -> children: none; text: "Price" |
| PriceCardMeta | partial | div | data-prop-interval-field, data-prop-model-field | div -> children: span, strong; text: "Price Model: default Interval: PriceCardMeta intervalField" |
| PriceSummary | partial | section | data-prop-amount-field, data-prop-currency-field, data-prop-interval-field, data-prop-model-field, data-prop-tax-behavior-field | section -> children: h3, dl, div, dt, dd; text: "Price Summary Amount 42 Currency USD Model default Interval " |
| RelativeTimestamp | empty-shell | time | data-prop-fallback-field, data-prop-field, data-prop-timezone-parameter | time (no inner HTML) |
| RoleAssignmentForm | partial | form | data-prop-available-roles-field, data-prop-default-role-parameter, data-prop-membership-field | form -> children: header, h3, div, label, span, select; text: "Role Assignment Role Select... Assignee" |
| RoleBadgeList | partial | span | data-prop-fallback-role-parameter, data-prop-roles-field | span -> children: none; text: "Roles" |
| Select | partial | select | data-prop-label, data-prop-value | select -> children: option; text: "Weekly Monthly" |
| Stack | empty-shell | div | data-prop-direction, data-prop-gap | div (no inner HTML) |
| StateTransitionEvent | partial | article | data-prop-history-field, data-prop-label-field | article -> children: p; text: "State Transition" |
| StatusBadge | partial | span | data-prop-field | span -> children: none; text: "Status" |
| StatusColorLegend | partial | section | data-prop-badge-field, data-prop-parameter | section -> children: h3, dl; text: "Status Color Legend" |
| StatusSelector | partial | div | data-prop-field, data-prop-initial-parameter, data-prop-options-parameter | div -> children: label, span, select, option; text: "Status draft active inactive" |
| StatusTimeline | partial | div | data-prop-field, data-prop-history-field, data-prop-states-parameter | div -> children: h3, ol, li; text: "Status Timeline No events" |
| Table | partial | table | data-prop-headers | table -> children: thead, tr, th, tbody, td; text: "Column 1 Column 2 Column 3 Users 1,240 +12% Revenue $42k +8%" |
| Tabs | full-content | section | none | section -> children: div, button; text: "Overview Pipeline Team" |
| TagInput | partial | fieldset | data-prop-allow-custom-parameter, data-prop-allow-list-parameter, data-prop-field, data-prop-max-tags-parameter | fieldset -> children: legend, div, label, span, input; text: "Tag Input Tag" |
| TagManager | partial | form | data-prop-allow-custom-parameter, data-prop-allow-list-parameter, data-prop-field, data-prop-max-tags-parameter | form -> children: header, h3, div, label, span, input; text: "Tag Manager Add Tag" |
| TagPills | empty-shell | div | data-prop-field | div (no inner HTML) |
| TagSummary | partial | section | data-prop-count-field, data-prop-field | section -> children: h3, dl, div, dt, dd; text: "Tag Summary Tag Count 42 Tags TagSummary field" |
| TemplatePicker | partial | fieldset | data-prop-channels-field, data-prop-templates-field | fieldset -> children: legend, div, label, span, select, option; text: "Template Picker Template Select... Channel email sms in_app" |
| Text | full-content | p | none | p -> children: none; text: "Fragment fidelity probe text." |
| VizAreaControls | partial | fieldset | data-prop-baseline-field, data-prop-curve-field, data-prop-opacity-field, data-prop-tension-field | fieldset -> children: legend, div, label, span, select, option; text: "Viz Area Controls Curve linear monotone step Opacity Baselin" |
| VizAreaPreview | partial | div | data-prop-baseline-field, data-prop-curve-field, data-prop-opacity-field | div -> children: div; text: "Area preview (640 x 360)" |
| VizAxisControls | partial | fieldset | data-prop-aggregate-field, data-prop-axis, data-prop-field-field, data-prop-kind-field, data-prop-scale-field, data-prop-sort-field, data-prop-title-field, data-prop-zero-field | fieldset -> children: legend, div, label, span, input, select; text: "Viz Axis Controls X Field Y Field Scale linear band temporal" |
| VizAxisSummary | partial | section | data-prop-axis, data-prop-scale-field, data-prop-title-field, data-prop-zero-field | section -> children: h3, dl, div, dt, dd; text: "Viz Axis Summary Axis VizAxisSummary axis" |
| VizColorControls | partial | fieldset | data-prop-channel-field, data-prop-contrast-field, data-prop-redundancy-field, data-prop-scheme-field | fieldset -> children: legend, div, label, span, select, option; text: "Viz Color Controls Scheme blues greens viridis Channel fill " |
| VizColorLegendConfig | partial | section | data-prop-field, data-prop-redundancy-field, data-prop-scheme-field | section -> children: h3, dl, div, dt, dd; text: "Viz Color Legend Field VizColorLegendConfig field" |
| VizEncodingBadge | partial | span | data-prop-field-field | span -> children: none; text: "VizEncodingBadge axis" |
| VizLineControls | partial | fieldset | data-prop-curve-field, data-prop-join-field, data-prop-markers-field, data-prop-stroke-field | fieldset -> children: legend, div, label, span, select, option; text: "Viz Line Controls Curve linear monotone Stroke Width Line Jo" |
| VizLinePreview | partial | div | data-prop-curve-field, data-prop-markers-field, data-prop-stroke-width-field | div -> children: div; text: "Line preview (640 x 360)" |
| VizMarkControls | partial | fieldset | data-prop-corner-radius-field, data-prop-orientation-field, data-prop-padding-field, data-prop-stacking-field | fieldset -> children: legend, div, label, span, select, option; text: "Viz Mark Controls Orientation vertical horizontal Band Paddi" |
| VizMarkPreview | partial | div | data-prop-orientation-field, data-prop-stacking-field, data-prop-type-field | div -> children: div; text: "Mark preview (640 x 360)" |
| VizPointControls | partial | fieldset | data-prop-opacity-field, data-prop-shape-field, data-prop-size-field, data-prop-stroke-field | fieldset -> children: legend, div, label, span, select, option; text: "Viz Point Controls Shape circle square diamond Size Opacity " |
| VizPointPreview | partial | div | data-prop-fill-field, data-prop-shape-field, data-prop-size-field | div -> children: div; text: "Point preview (640 x 360)" |
| VizRoleBadge | partial | span | data-prop-label-field | span -> children: none; text: "Viz Role" |
| VizScaleControls | partial | fieldset | data-prop-domain-max-field, data-prop-domain-min-field, data-prop-format-field, data-prop-mode-field, data-prop-nice-field, data-prop-range-max-field, data-prop-range-min-field, data-prop-timezone-field, data-prop-type, data-prop-zero-field | fieldset -> children: legend, div, label, span, select, option; text: "Viz Scale Controls Scale Type linear temporal Domain Min Dom" |
| VizScaleSummary | partial | section | data-prop-domain-max-field, data-prop-domain-min-field, data-prop-mode-field, data-prop-nice-field, data-prop-timezone-field, data-prop-type, data-prop-zero-field | section -> children: h3, dl, div, dt, dd; text: "Viz Scale Summary Type VizScaleSummary type" |
| VizSizeControls | partial | fieldset | data-prop-max-area-field, data-prop-max-field, data-prop-min-area-field, data-prop-min-field, data-prop-strategy-field | fieldset -> children: legend, div, label, span, select, option; text: "Viz Size Controls Strategy range area Min Size Max Size Max " |
| VizSizeSummary | partial | section | data-prop-field, data-prop-max-field, data-prop-min-field, data-prop-strategy-field | section -> children: h3, dl, div, dt, dd; text: "Viz Size Summary Field VizSizeSummary field" |

## Empty-Shell Components

- Card: data attrs -> data-prop-trend, data-prop-value
- InlineLabel: data attrs -> data-prop-field
- RelativeTimestamp: data attrs -> data-prop-fallback-field, data-prop-field, data-prop-timezone-parameter
- Stack: data attrs -> data-prop-direction, data-prop-gap
- TagPills: data attrs -> data-prop-field

## Full-Content Components

- Button: button -> children: none; text: "Primary action"
- Tabs: section -> children: div, button; text: "Overview Pipeline Team"
- Text: p -> children: none; text: "Fragment fidelity probe text."

## Partial Components

- AddressCollectionPanel: attrs=data-prop-default-role-field, data-prop-field, data-prop-role-field, data-prop-role-parameter; section -> children: header, h3, div; text: "Addresses"
- AddressEditor: attrs=data-prop-allow-dynamic-parameter, data-prop-default-role-field, data-prop-field, data-prop-role-parameter; form -> children: header, h3, div, label, span, input; text: "Address Editor Street City Region Postal Code"
- AddressSummaryBadge: attrs=data-prop-field; span -> children: none; text: "Address"
- AddressValidationTimeline: attrs=data-prop-field; div -> children: h3, ol, li; text: "Address Validation Timeline No events"
- ArchiveEvent: attrs=data-prop-archived-at-field, data-prop-reason-field, data-prop-restored-at-field; article -> children: p; text: "Archive Event"
- ArchivePill: attrs=data-prop-archived-at-field, data-prop-field; span -> children: none; text: "Archive"
- ArchiveSummary: attrs=data-prop-archived-at-field, data-prop-archived-field, data-prop-reason-field, data-prop-restore-window-parameter, data-prop-restored-at-field, data-prop-retain-history-parameter; section -> children: h3, dl, div, dt, dd; text: "Archive Summary Archived At ArchiveSummary archivedAtField R"
- AuditEvent: attrs=data-prop-timestamp-field, data-prop-timezone-parameter, data-prop-type-field; article -> children: p; text: "Audit Event"
- AuditTimeline: attrs=data-prop-created-field, data-prop-event-field, data-prop-event-options-parameter, data-prop-event-timestamp-field, data-prop-updated-field; div -> children: h3, ol, li; text: "Audit Timeline No events"
- Badge: attrs=data-prop-intent; span -> children: none; text: "Active"
- Banner: attrs=data-prop-intent; section -> children: none; text: "Track pipeline health and delivery metrics."
- CancellationBadge: attrs=data-prop-field; span -> children: none; text: "Cancellation"
- CancellationEvent: attrs=data-prop-code-field, data-prop-label-field, data-prop-timestamp-field; article -> children: p; text: "Cancellation Event"
- CancellationForm: attrs=data-prop-allowed-reasons-parameter, data-prop-code-field, data-prop-reason-field, data-prop-require-reason-parameter, data-prop-window-parameter; form -> children: header, h3, div, label, span, select; text: "Cancellation Form Reason Code no_longer_needed budget duplic"
- CancellationSummary: attrs=data-prop-cancel-at-period-end-field, data-prop-code-field, data-prop-reason-field, data-prop-requested-at-field; section -> children: h3, dl, div, dt, dd; text: "Cancellation Summary Cancel at Period End CancellationSummar"
- CardHeader: attrs=data-prop-supporting-field, data-prop-title-field; header -> children: h3; text: "Card"
- ClassificationBadge: attrs=data-prop-primary-category-field, data-prop-tag-preview-field; span -> children: none; text: "Classification"
- ClassificationEditor: attrs=data-prop-max-tags-parameter, data-prop-mode-parameter, data-prop-tag-policy-parameter; form -> children: header, h3, div, label, span, input; text: "Classification Editor Category Tags Mode strict flexible"
- ClassificationPanel: attrs=data-prop-categories-field, data-prop-metadata-field, data-prop-mode-parameter, data-prop-tags-field; section -> children: header, h3, div; text: "Classification"
- ColorizedBadge: attrs=data-prop-field; span -> children: none; text: "Color"
- ColorStatePicker: attrs=data-prop-field, data-prop-parameter; fieldset -> children: legend, div, label, span, select, option; text: "Color State Picker Color State default success warning criti"
- ColorSwatch: attrs=data-prop-field, data-prop-size; span -> children: none; text: "default"
- CommunicationDetailPanel: attrs=data-prop-channels-field, data-prop-conversations-field, data-prop-policies-field, data-prop-templates-field; section -> children: header, h3, div; text: "Communication"
- DetailHeader: attrs=data-prop-subtitle-field, data-prop-title-field; header -> children: h2; text: "Details"
- FormLabelGroup: attrs=data-prop-label-field, data-prop-placeholder-field; label -> children: span; text: "Label"
- GeocodablePreview: attrs=data-prop-detected-fields-field, data-prop-requires-lookup-field, data-prop-resolution-field; section -> children: h3, dl, div, dt, dd; text: "Geocodable Preview Resolution GeocodablePreview resolutionFi"
- GeoFieldMappingForm: attrs=data-prop-auto-detect-field, data-prop-identifier-field, data-prop-latitude-field, data-prop-longitude-field; form -> children: header, h3, div, label, span, input; text: "Geo Field Mapping Latitude Field Longitude Field Identifier "
- GeoResolutionBadge: attrs=data-prop-resolution-field; span -> children: none; text: "Geo"
- Input: attrs=data-prop-label; input -> children: input; text: none
- LabelCell: attrs=data-prop-description-field, data-prop-field; span -> children: span; text: none
- MembershipAuditTimeline: attrs=data-prop-field; div -> children: h3, ol, li; text: "Membership Timeline No events"
- MembershipPanel: attrs=data-prop-hierarchy-field, data-prop-memberships-field, data-prop-permission-field, data-prop-role-field; section -> children: header, h3, div; text: "Membership"
- MessageEventTimeline: attrs=data-prop-messages-field, data-prop-statuses-field; div -> children: h3, ol, li; text: "Message Timeline No events"
- MessageStatusBadge: attrs=data-prop-statuses-field; span -> children: none; text: "Message"
- OwnerBadge: attrs=data-prop-owner-id-field, data-prop-owner-type-field; span -> children: none; text: "Owner"
- OwnershipMeta: attrs=data-prop-owner-type-field, data-prop-role-field; div -> children: span, strong; text: "Ownership Owner Type: OwnershipMeta ownerTypeField Role: Own"
- OwnershipSummary: attrs=data-prop-allow-transfer-parameter, data-prop-owner-id-field, data-prop-owner-type-field, data-prop-role-field, data-prop-transferred-at-field; section -> children: h3, dl, div, dt, dd; text: "Ownership Summary Owner ID OwnershipSummary ownerIdField Own"
- PreferenceEditor: attrs=data-prop-document-field, data-prop-namespaces-field, data-prop-registry-namespace-parameter; form -> children: header, h3, div, label, span, select; text: "Preference Editor Namespace default Preference Document"
- PreferencePanel: attrs=data-prop-metadata-field, data-prop-namespace-field, data-prop-preferences-field; section -> children: header, h3, div; text: "Preferences"
- PreferenceSummaryBadge: attrs=data-prop-namespaces-field, data-prop-version-field; span -> children: none; text: "Preferences"
- PreferenceTimeline: attrs=data-prop-metadata-field; div -> children: h3, ol, li; text: "Preference Timeline No events"
- PriceBadge: attrs=data-prop-amount-field, data-prop-currency-field; span -> children: none; text: "Price"
- PriceCardMeta: attrs=data-prop-interval-field, data-prop-model-field; div -> children: span, strong; text: "Price Model: default Interval: PriceCardMeta intervalField"
- PriceSummary: attrs=data-prop-amount-field, data-prop-currency-field, data-prop-interval-field, data-prop-model-field, data-prop-tax-behavior-field; section -> children: h3, dl, div, dt, dd; text: "Price Summary Amount 42 Currency USD Model default Interval "
- RoleAssignmentForm: attrs=data-prop-available-roles-field, data-prop-default-role-parameter, data-prop-membership-field; form -> children: header, h3, div, label, span, select; text: "Role Assignment Role Select... Assignee"
- RoleBadgeList: attrs=data-prop-fallback-role-parameter, data-prop-roles-field; span -> children: none; text: "Roles"
- Select: attrs=data-prop-label, data-prop-value; select -> children: option; text: "Weekly Monthly"
- StateTransitionEvent: attrs=data-prop-history-field, data-prop-label-field; article -> children: p; text: "State Transition"
- StatusBadge: attrs=data-prop-field; span -> children: none; text: "Status"
- StatusColorLegend: attrs=data-prop-badge-field, data-prop-parameter; section -> children: h3, dl; text: "Status Color Legend"
- StatusSelector: attrs=data-prop-field, data-prop-initial-parameter, data-prop-options-parameter; div -> children: label, span, select, option; text: "Status draft active inactive"
- StatusTimeline: attrs=data-prop-field, data-prop-history-field, data-prop-states-parameter; div -> children: h3, ol, li; text: "Status Timeline No events"
- Table: attrs=data-prop-headers; table -> children: thead, tr, th, tbody, td; text: "Column 1 Column 2 Column 3 Users 1,240 +12% Revenue $42k +8%"
- TagInput: attrs=data-prop-allow-custom-parameter, data-prop-allow-list-parameter, data-prop-field, data-prop-max-tags-parameter; fieldset -> children: legend, div, label, span, input; text: "Tag Input Tag"
- TagManager: attrs=data-prop-allow-custom-parameter, data-prop-allow-list-parameter, data-prop-field, data-prop-max-tags-parameter; form -> children: header, h3, div, label, span, input; text: "Tag Manager Add Tag"
- TagSummary: attrs=data-prop-count-field, data-prop-field; section -> children: h3, dl, div, dt, dd; text: "Tag Summary Tag Count 42 Tags TagSummary field"
- TemplatePicker: attrs=data-prop-channels-field, data-prop-templates-field; fieldset -> children: legend, div, label, span, select, option; text: "Template Picker Template Select... Channel email sms in_app"
- VizAreaControls: attrs=data-prop-baseline-field, data-prop-curve-field, data-prop-opacity-field, data-prop-tension-field; fieldset -> children: legend, div, label, span, select, option; text: "Viz Area Controls Curve linear monotone step Opacity Baselin"
- VizAreaPreview: attrs=data-prop-baseline-field, data-prop-curve-field, data-prop-opacity-field; div -> children: div; text: "Area preview (640 x 360)"
- VizAxisControls: attrs=data-prop-aggregate-field, data-prop-axis, data-prop-field-field, data-prop-kind-field, data-prop-scale-field, data-prop-sort-field, data-prop-title-field, data-prop-zero-field; fieldset -> children: legend, div, label, span, input, select; text: "Viz Axis Controls X Field Y Field Scale linear band temporal"
- VizAxisSummary: attrs=data-prop-axis, data-prop-scale-field, data-prop-title-field, data-prop-zero-field; section -> children: h3, dl, div, dt, dd; text: "Viz Axis Summary Axis VizAxisSummary axis"
- VizColorControls: attrs=data-prop-channel-field, data-prop-contrast-field, data-prop-redundancy-field, data-prop-scheme-field; fieldset -> children: legend, div, label, span, select, option; text: "Viz Color Controls Scheme blues greens viridis Channel fill "
- VizColorLegendConfig: attrs=data-prop-field, data-prop-redundancy-field, data-prop-scheme-field; section -> children: h3, dl, div, dt, dd; text: "Viz Color Legend Field VizColorLegendConfig field"
- VizEncodingBadge: attrs=data-prop-field-field; span -> children: none; text: "VizEncodingBadge axis"
- VizLineControls: attrs=data-prop-curve-field, data-prop-join-field, data-prop-markers-field, data-prop-stroke-field; fieldset -> children: legend, div, label, span, select, option; text: "Viz Line Controls Curve linear monotone Stroke Width Line Jo"
- VizLinePreview: attrs=data-prop-curve-field, data-prop-markers-field, data-prop-stroke-width-field; div -> children: div; text: "Line preview (640 x 360)"
- VizMarkControls: attrs=data-prop-corner-radius-field, data-prop-orientation-field, data-prop-padding-field, data-prop-stacking-field; fieldset -> children: legend, div, label, span, select, option; text: "Viz Mark Controls Orientation vertical horizontal Band Paddi"
- VizMarkPreview: attrs=data-prop-orientation-field, data-prop-stacking-field, data-prop-type-field; div -> children: div; text: "Mark preview (640 x 360)"
- VizPointControls: attrs=data-prop-opacity-field, data-prop-shape-field, data-prop-size-field, data-prop-stroke-field; fieldset -> children: legend, div, label, span, select, option; text: "Viz Point Controls Shape circle square diamond Size Opacity "
- VizPointPreview: attrs=data-prop-fill-field, data-prop-shape-field, data-prop-size-field; div -> children: div; text: "Point preview (640 x 360)"
- VizRoleBadge: attrs=data-prop-label-field; span -> children: none; text: "Viz Role"
- VizScaleControls: attrs=data-prop-domain-max-field, data-prop-domain-min-field, data-prop-format-field, data-prop-mode-field, data-prop-nice-field, data-prop-range-max-field, data-prop-range-min-field, data-prop-timezone-field, data-prop-type, data-prop-zero-field; fieldset -> children: legend, div, label, span, select, option; text: "Viz Scale Controls Scale Type linear temporal Domain Min Dom"
- VizScaleSummary: attrs=data-prop-domain-max-field, data-prop-domain-min-field, data-prop-mode-field, data-prop-nice-field, data-prop-timezone-field, data-prop-type, data-prop-zero-field; section -> children: h3, dl, div, dt, dd; text: "Viz Scale Summary Type VizScaleSummary type"
- VizSizeControls: attrs=data-prop-max-area-field, data-prop-max-field, data-prop-min-area-field, data-prop-min-field, data-prop-strategy-field; fieldset -> children: legend, div, label, span, select, option; text: "Viz Size Controls Strategy range area Min Size Max Size Max "
- VizSizeSummary: attrs=data-prop-field, data-prop-max-field, data-prop-min-field, data-prop-strategy-field; section -> children: h3, dl, div, dt, dd; text: "Viz Size Summary Field VizSizeSummary field"

## Error Components

- Grid: UNKNOWN_COMPONENT: Component 'Grid' is not in the OODS registry

## Card Variant Probes

| Variant | Classification | data-prop-* attrs | Structure / Errors |
| --- | --- | --- | --- |
| title-only | empty-shell | none | article (no inner HTML) |
| title-value | empty-shell | data-prop-value | article (no inner HTML) |
| title-value-trend | empty-shell | data-prop-trend, data-prop-value | article (no inner HTML) |

## Evidence Paths

- Raw per-component JSON: `cmos/evidence/s17-m01/raw-fragments/*.json`
- Raw per-component fragment HTML: `cmos/evidence/s17-m01/raw-fragments/html/*.html`
- Card variants: `cmos/evidence/s17-m01/raw-fragments/card-variants/*`
