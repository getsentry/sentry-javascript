import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-sample-component',
  standalone: true,
  template: `<div>Component</div>`,
})
export class SampleComponent implements OnInit {
  ngOnInit() {
    console.log('SampleComponent');
  }
}
